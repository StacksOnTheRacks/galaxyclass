import { randomUUID } from 'node:crypto';
import { newTableRecord, tableMetaItem, tableMetaKey } from '@galaxyclass/scribble/table-record';

export interface ScribbleSeedEvent {
  RequestType: 'Create' | 'Update' | 'Delete';
  PhysicalResourceId?: string;
  ResourceProperties: {
    TableName?: string;
    TableLabel?: string;
  };
}

export interface ScribbleSeedResponse {
  PhysicalResourceId: string;
  Data?: { TableId: string };
}

export interface ScribbleSeedDeps {
  /** Writes a new item; must fail if PK already exists. */
  putNew(tableName: string, item: Record<string, unknown>): Promise<void>;
  /** Renames an existing table without touching seats or game state. */
  rename(tableName: string, tableId: string, label: string): Promise<void>;
  randomTableId(): string;
  now(): string;
}

function required(value: string | undefined, name: string): string {
  if (!value || value.trim() === '') {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function createScribbleSeedHandler(deps: ScribbleSeedDeps) {
  return async function onEvent(event: ScribbleSeedEvent): Promise<ScribbleSeedResponse> {
    if (event.RequestType === 'Delete') {
      // Tables outlive the custom resource; the DynamoDB table's removal policy decides their fate.
      return { PhysicalResourceId: required(event.PhysicalResourceId, 'PhysicalResourceId') };
    }
    const tableName = required(event.ResourceProperties.TableName, 'TableName');
    const label = required(event.ResourceProperties.TableLabel, 'TableLabel');

    if (event.RequestType === 'Update') {
      const tableId = required(event.PhysicalResourceId, 'PhysicalResourceId');
      await deps.rename(tableName, tableId, label);
      return { PhysicalResourceId: tableId, Data: { TableId: tableId } };
    }

    const tableId = deps.randomTableId();
    const record = newTableRecord({ tableId, createdAt: deps.now(), tableName: label });
    await deps.putNew(tableName, tableMetaItem(record));
    return { PhysicalResourceId: tableId, Data: { TableId: tableId } };
  };
}

async function defaultDeps(): Promise<ScribbleSeedDeps> {
  const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, PutCommand, UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  return {
    async putNew(tableName, item) {
      await client.send(
        new PutCommand({ TableName: tableName, Item: item, ConditionExpression: 'attribute_not_exists(PK)' }),
      );
    },
    async rename(tableName, tableId, label) {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: tableMetaKey(tableId),
          UpdateExpression: 'SET tableName = :label',
          ConditionExpression: 'attribute_exists(PK)',
          ExpressionAttributeValues: { ':label': label },
        }),
      );
    },
    randomTableId: () => randomUUID(),
    now: () => new Date().toISOString(),
  };
}

let handlerPromise: Promise<(event: ScribbleSeedEvent) => Promise<ScribbleSeedResponse>> | undefined;

export async function handler(event: ScribbleSeedEvent): Promise<ScribbleSeedResponse> {
  handlerPromise ??= defaultDeps().then(createScribbleSeedHandler);
  return (await handlerPromise)(event);
}
