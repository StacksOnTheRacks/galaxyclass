import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { BY_TABLE_INDEX, connGsiSk, connPk, META_SK, SEAT_SK_PREFIX, seatSk, tableGsiPk, tablePk } from './keys.js';
import { sortSeats, type ScribbleStore, type TableCommit } from './store.js';
import { parseTableItem } from './table-record.js';
import type { SeatRecord, TableRecord } from './types.js';

export interface DocumentClientLike {
  send(command: unknown): Promise<unknown>;
}

function parseSeatItem(item: Record<string, unknown>): SeatRecord {
  const seat: SeatRecord = {
    seatId: String(item.seatId),
    displayName: String(item.displayName),
    avatarId: Number(item.avatarId ?? 1),
    seatTokenHash: String(item.seatTokenHash),
    rack: Array.isArray(item.rack) ? (item.rack as SeatRecord['rack']) : [],
    score: Number(item.score ?? 0),
  };
  if (typeof item.playerSub === 'string' && item.playerSub) {
    seat.playerSub = item.playerSub;
  }
  if (typeof item.connectionId === 'string' && item.connectionId) {
    seat.connectionId = item.connectionId;
  }
  return seat;
}

function tableItem(table: TableRecord): Record<string, unknown> {
  return { PK: tablePk(table.tableId), SK: META_SK, ...table };
}

function seatItem(tableId: string, seat: SeatRecord): Record<string, unknown> {
  return { PK: tablePk(tableId), SK: seatSk(seat.seatId), ...seat };
}

function isConditionalFailure(error: unknown): boolean {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
  return name === 'ConditionalCheckFailedException' || name === 'TransactionCanceledException';
}

export function createDynamoStore(client: DocumentClientLike, tableName: string): ScribbleStore {
  return {
    async putConnection(connectionId) {
      await client.send(new PutCommand({ TableName: tableName, Item: { PK: connPk(connectionId), SK: META_SK, connectionId } }));
    },

    async deleteConnection(connectionId) {
      await client.send(new DeleteCommand({ TableName: tableName, Key: { PK: connPk(connectionId), SK: META_SK } }));
    },

    async getConnection(connectionId) {
      const result = (await client.send(
        new GetCommand({ TableName: tableName, Key: { PK: connPk(connectionId), SK: META_SK }, ConsistentRead: true }),
      )) as { Item?: Record<string, unknown> };
      if (!result.Item) {
        return null;
      }
      return {
        connectionId: String(result.Item.connectionId),
        ...(typeof result.Item.tableId === 'string' ? { tableId: result.Item.tableId } : {}),
        ...(typeof result.Item.seatId === 'string' ? { seatId: result.Item.seatId } : {}),
      };
    },

    async bindConnectionToTable(connectionId, tableId) {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK: connPk(connectionId), SK: META_SK },
          UpdateExpression: 'SET tableId = :tableId, GSI1PK = :gsiPk, GSI1SK = :gsiSk REMOVE seatId',
          ConditionExpression: 'attribute_exists(PK)',
          ExpressionAttributeValues: {
            ':tableId': tableId,
            ':gsiPk': tableGsiPk(tableId),
            ':gsiSk': connGsiSk(connectionId),
          },
        }),
      );
    },

    async listConnectionsForTable(tableId) {
      const result = (await client.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: BY_TABLE_INDEX,
          KeyConditionExpression: 'GSI1PK = :gsiPk',
          ExpressionAttributeValues: { ':gsiPk': tableGsiPk(tableId) },
        }),
      )) as { Items?: Array<Record<string, unknown>> };
      return (result.Items ?? []).map((item) => String(item.connectionId));
    },

    async getTable(tableId) {
      const result = (await client.send(
        new GetCommand({ TableName: tableName, Key: { PK: tablePk(tableId), SK: META_SK }, ConsistentRead: true }),
      )) as { Item?: Record<string, unknown> };
      return result.Item ? parseTableItem(result.Item) : null;
    },

    async putTable(table) {
      await client.send(
        new PutCommand({ TableName: tableName, Item: tableItem(table), ConditionExpression: 'attribute_not_exists(PK)' }),
      );
    },

    async listSeats(tableId) {
      const result = (await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': tablePk(tableId), ':prefix': SEAT_SK_PREFIX },
          ConsistentRead: true,
        }),
      )) as { Items?: Array<Record<string, unknown>> };
      return sortSeats((result.Items ?? []).map(parseSeatItem));
    },

    async commit(change: TableCommit) {
      const { table } = change;
      const items: unknown[] = [
        {
          Put: {
            TableName: tableName,
            Item: tableItem(table),
            ConditionExpression: '#version = :expected',
            ExpressionAttributeNames: { '#version': 'version' },
            ExpressionAttributeValues: { ':expected': change.expectedVersion },
          },
        },
        ...change.putSeats.map((seat) => ({ Put: { TableName: tableName, Item: seatItem(table.tableId, seat) } })),
        ...change.deleteSeatIds.map((seatId) => ({
          Delete: { TableName: tableName, Key: { PK: tablePk(table.tableId), SK: seatSk(seatId) } },
        })),
        ...change.connectionSeats.map(({ connectionId, seatId }) => ({
          Update: {
            TableName: tableName,
            Key: { PK: connPk(connectionId), SK: META_SK },
            ConditionExpression: 'attribute_exists(PK)',
            ...(seatId
              ? { UpdateExpression: 'SET seatId = :seatId', ExpressionAttributeValues: { ':seatId': seatId } }
              : { UpdateExpression: 'REMOVE seatId' }),
          },
        })),
      ];
      try {
        await client.send(new TransactWriteCommand({ TransactItems: items as never }));
        return true;
      } catch (error) {
        if (isConditionalFailure(error)) {
          return false;
        }
        throw error;
      }
    },
  };
}
