import { randomUUID } from 'node:crypto';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';

export interface SeedTableEvent {
  RequestType: 'Create' | 'Update' | 'Delete';
  PhysicalResourceId?: string;
  ResourceProperties: { TableName: string } & Record<string, unknown>;
}

export interface SeedTableResponse {
  PhysicalResourceId: string;
  Data?: { TableId: string };
}

export interface SeedPutItemInput {
  TableName: string;
  Item: Record<string, AttributeValue>;
  ConditionExpression: string;
}

export interface SeedTableDeps {
  putItem: (input: SeedPutItemInput) => Promise<void>;
  randomTableId: () => string;
  now: () => string;
}

const SEEDED_TABLE_DEFAULTS = {
  defaultStack: 2000,
  maxSeats: 8,
  smallBlind: 1,
  bigBlind: 2,
} as const;

export function buildSeedTableItem(tableId: string, createdAt: string): Record<string, AttributeValue> {
  return {
    PK: { S: `TABLE#${tableId}` },
    SK: { S: 'META' },
    tableId: { S: tableId },
    version: { N: '1' },
    status: { S: 'open' },
    createdAt: { S: createdAt },
    defaultStack: { N: String(SEEDED_TABLE_DEFAULTS.defaultStack) },
    maxSeats: { N: String(SEEDED_TABLE_DEFAULTS.maxSeats) },
    blinds: {
      M: {
        smallBlind: { N: String(SEEDED_TABLE_DEFAULTS.smallBlind) },
        bigBlind: { N: String(SEEDED_TABLE_DEFAULTS.bigBlind) },
      },
    },
    handNumber: { N: '0' },
    pot: { N: '0' },
    board: { L: [] },
    street: { NULL: true },
    currentSeatId: { NULL: true },
  };
}

export function createSeedTableHandler(deps: SeedTableDeps) {
  return async (event: SeedTableEvent): Promise<SeedTableResponse> => {
    if (event.RequestType === 'Create') {
      const tableId = deps.randomTableId();
      await deps.putItem({
        TableName: event.ResourceProperties.TableName,
        Item: buildSeedTableItem(tableId, deps.now()),
        ConditionExpression: 'attribute_not_exists(PK)',
      });
      return { PhysicalResourceId: tableId, Data: { TableId: tableId } };
    }

    const tableId = event.PhysicalResourceId;
    if (!tableId) {
      throw new Error(`${event.RequestType} requires the seeded PhysicalResourceId`);
    }

    if (event.RequestType === 'Update') {
      return { PhysicalResourceId: tableId, Data: { TableId: tableId } };
    }

    return { PhysicalResourceId: tableId };
  };
}

let defaultHandler: ReturnType<typeof createSeedTableHandler> | undefined;

export async function handler(event: SeedTableEvent): Promise<SeedTableResponse> {
  if (!defaultHandler) {
    const { DynamoDBClient, PutItemCommand } = await import('@aws-sdk/client-dynamodb');
    const client = new DynamoDBClient({});
    defaultHandler = createSeedTableHandler({
      putItem: async (input) => {
        await client.send(new PutItemCommand(input));
      },
      randomTableId: () => randomUUID(),
      now: () => new Date().toISOString(),
    });
  }
  return defaultHandler(event);
}
