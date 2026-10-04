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
  ConditionExpression?: string;
}

export interface SeedGetItemInput {
  TableName: string;
  Key: Record<string, AttributeValue>;
}

export interface SeedUpdateItemInput {
  TableName: string;
  Key: Record<string, AttributeValue>;
  UpdateExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, AttributeValue>;
}

export interface SeedTableDeps {
  putItem: (input: SeedPutItemInput) => Promise<void>;
  getItem: (input: SeedGetItemInput) => Promise<Record<string, AttributeValue> | undefined>;
  updateItem: (input: SeedUpdateItemInput) => Promise<void>;
  randomTableId: () => string;
  now: () => string;
}

export const SEEDED_TABLE_MAX_SEATS = 8;

const GROUP_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SeedTableGroup {
  groupId: string;
  tableName: string;
}

export function readSeedTableGroup(properties: Record<string, unknown>): SeedTableGroup {
  const groupId = properties.GroupId;
  const tableName = properties.TableLabel;
  if (typeof groupId !== 'string' || !GROUP_ID_RE.test(groupId) || UUID_RE.test(groupId)) {
    throw new Error('GroupId must be a slug');
  }
  if (typeof tableName !== 'string' || tableName.trim() === '' || tableName.trim().length > 80) {
    throw new Error('TableLabel is required');
  }
  return { groupId, tableName: tableName.trim() };
}

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

export function buildGroupMembershipItem(
  groupId: string,
  tableId: string,
  createdAt: string,
): Record<string, AttributeValue> {
  return {
    PK: { S: `GROUP#${groupId}` },
    SK: { S: `TABLE#${createdAt}#${tableId}` },
    tableId: { S: tableId },
    groupId: { S: groupId },
    createdAt: { S: createdAt },
    anchor: { BOOL: true },
  };
}

export function buildSeedTableItem(
  tableId: string,
  createdAt: string,
  stakes: SeedTableStakes,
  group: SeedTableGroup,
): Record<string, AttributeValue> {
  return {
    PK: { S: `TABLE#${tableId}` },
    SK: { S: 'META' },
    tableId: { S: tableId },
    groupId: { S: group.groupId },
    tableName: { S: group.tableName },
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

async function putAnchorMembership(
  deps: SeedTableDeps,
  tableName: string,
  group: SeedTableGroup,
  tableId: string,
  createdAt: string,
): Promise<void> {
  await deps.putItem({
    TableName: tableName,
    Item: buildGroupMembershipItem(group.groupId, tableId, createdAt),
  });
}

export function createSeedTableHandler(deps: SeedTableDeps) {
  return async (event: SeedTableEvent): Promise<SeedTableResponse> => {
    const dynamoTable = event.ResourceProperties.TableName;
    const group = readSeedTableGroup(event.ResourceProperties);

    if (event.RequestType === 'Create') {
      const tableId = deps.randomTableId();
      const createdAt = deps.now();
      await deps.putItem({
        TableName: dynamoTable,
        Item: buildSeedTableItem(tableId, createdAt, readSeedTableStakes(event.ResourceProperties), group),
        ConditionExpression: 'attribute_not_exists(PK)',
      });
      await putAnchorMembership(deps, dynamoTable, group, tableId, createdAt);
      return { PhysicalResourceId: tableId, Data: { TableId: tableId } };
    }

    const tableId = event.PhysicalResourceId;
    if (!tableId) {
      throw new Error(`${event.RequestType} requires the seeded PhysicalResourceId`);
    }

    if (event.RequestType === 'Update') {
      const existing = await deps.getItem({
        TableName: dynamoTable,
        Key: { PK: { S: `TABLE#${tableId}` }, SK: { S: 'META' } },
      });
      const createdAt = existing?.createdAt?.S;
      if (!createdAt) {
        throw new Error('seeded table is missing createdAt');
      }
      await deps.updateItem({
        TableName: dynamoTable,
        Key: { PK: { S: `TABLE#${tableId}` }, SK: { S: 'META' } },
        UpdateExpression: 'SET #groupId = :groupId, #tableName = :tableName',
        ExpressionAttributeNames: { '#groupId': 'groupId', '#tableName': 'tableName' },
        ExpressionAttributeValues: {
          ':groupId': { S: group.groupId },
          ':tableName': { S: group.tableName },
        },
      });
      await putAnchorMembership(deps, dynamoTable, group, tableId, createdAt);
      return { PhysicalResourceId: tableId, Data: { TableId: tableId } };
    }

    return { PhysicalResourceId: tableId };
  };
}

let defaultHandler: ReturnType<typeof createSeedTableHandler> | undefined;

export async function handler(event: SeedTableEvent): Promise<SeedTableResponse> {
  if (!defaultHandler) {
    const { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand } = await import(
      '@aws-sdk/client-dynamodb'
    );
    const client = new DynamoDBClient({});
    defaultHandler = createSeedTableHandler({
      putItem: async (input) => {
        await client.send(new PutItemCommand(input));
      },
      getItem: async (input) => {
        const result = await client.send(new GetItemCommand(input));
        return result.Item;
      },
      updateItem: async (input) => {
        await client.send(new UpdateItemCommand(input));
      },
      randomTableId: () => randomUUID(),
      now: () => new Date().toISOString(),
    });
  }
  return defaultHandler(event);
}
