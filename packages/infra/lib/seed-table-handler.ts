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

export const SEEDED_TABLE_MAX_SEATS = 8;

export interface SeedTableStakes {
  smallBlind: number;
  bigBlind: number;
  defaultStack: number;
}

function requiredPositiveInt(properties: Record<string, unknown>, key: string): number {
  const value = properties[key];
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
  return parsed;
}

export function readSeedTableStakes(properties: Record<string, unknown>): SeedTableStakes {
  const smallBlind = requiredPositiveInt(properties, 'SmallBlind');
  const bigBlind = requiredPositiveInt(properties, 'BigBlind');
  const defaultStack = requiredPositiveInt(properties, 'DefaultStack');
  if (bigBlind <= smallBlind) {
    throw new Error('BigBlind must be greater than SmallBlind');
  }
  if (defaultStack < bigBlind) {
    throw new Error('DefaultStack must cover the big blind');
  }
  return { smallBlind, bigBlind, defaultStack };
}

export function buildSeedTableItem(
  tableId: string,
  createdAt: string,
  stakes: SeedTableStakes,
): Record<string, AttributeValue> {
  return {
    PK: { S: `TABLE#${tableId}` },
    SK: { S: 'META' },
    tableId: { S: tableId },
    version: { N: '1' },
    status: { S: 'open' },
    createdAt: { S: createdAt },
    defaultStack: { N: String(stakes.defaultStack) },
    maxSeats: { N: String(SEEDED_TABLE_MAX_SEATS) },
    blinds: {
      M: {
        smallBlind: { N: String(stakes.smallBlind) },
        bigBlind: { N: String(stakes.bigBlind) },
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
        Item: buildSeedTableItem(tableId, deps.now(), readSeedTableStakes(event.ResourceProperties)),
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
