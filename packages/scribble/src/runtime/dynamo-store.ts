import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  BY_TABLE_INDEX,
  CONN_GSI_SK_PREFIX,
  connGsiSk,
  connPk,
  memberGsiSk,
  MEMBER_GSI_SK_PREFIX,
  memberPk,
  MEMBERSHIP_SK_PREFIX,
  membershipSk,
  META_SK,
  SEAT_SK_PREFIX,
  seatSk,
  tableGsiPk,
  tablePk,
} from './keys.js';
import { sortSeats, type ScribbleStore, type TableCommit } from './store.js';
import { parseTableItem, tableMetaItem as tableItem } from './table-record.js';
import type { MembershipRecord, SeatRecord, TableRecord } from './types.js';

/** A member can belong to plenty of tables, but a runaway list should not cost an unbounded query. */
const MAX_MEMBERSHIP_PAGES = 5;
/** Deleting a table clears member list entries page by page; anything past this is pruned when listed. */
const MAX_TABLE_MEMBER_PAGES = 10;

function membershipItem(membership: MembershipRecord): Record<string, unknown> {
  return {
    PK: memberPk(membership.playerSub),
    SK: membershipSk(membership.tableId),
    GSI1PK: tableGsiPk(membership.tableId),
    GSI1SK: memberGsiSk(membership.playerSub),
    ...membership,
  };
}

function parseMembershipItem(item: Record<string, unknown>): MembershipRecord | null {
  if (typeof item.playerSub !== 'string' || typeof item.tableId !== 'string') {
    return null;
  }
  return {
    playerSub: item.playerSub,
    tableId: item.tableId,
    role: item.role === 'owner' ? 'owner' : 'member',
    joinedAt: String(item.joinedAt ?? ''),
  };
}

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
  if (typeof item.awaySince === 'string' && item.awaySince) {
    seat.awaySince = item.awaySince;
  }
  return seat;
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
          KeyConditionExpression: 'GSI1PK = :gsiPk AND begins_with(GSI1SK, :prefix)',
          ExpressionAttributeValues: { ':gsiPk': tableGsiPk(tableId), ':prefix': CONN_GSI_SK_PREFIX },
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

    async createTable(table, owner) {
      await client.send(
        new TransactWriteCommand({
          TransactItems: [
            { Put: { TableName: tableName, Item: tableItem(table), ConditionExpression: 'attribute_not_exists(PK)' } },
            { Put: { TableName: tableName, Item: membershipItem(owner) } },
          ],
        }),
      );
    },

    async addMembership(membership) {
      try {
        await client.send(
          new PutCommand({
            TableName: tableName,
            Item: membershipItem(membership),
            ConditionExpression: 'attribute_not_exists(PK)',
          }),
        );
      } catch (error) {
        if (!isConditionalFailure(error)) {
          throw error;
        }
      }
    },

    async listMemberships(playerSub) {
      const memberships: MembershipRecord[] = [];
      let startKey: Record<string, unknown> | undefined;
      for (let page = 0; page < MAX_MEMBERSHIP_PAGES; page++) {
        const result = (await client.send(
          new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
            ExpressionAttributeValues: { ':pk': memberPk(playerSub), ':prefix': MEMBERSHIP_SK_PREFIX },
            ...(startKey ? { ExclusiveStartKey: startKey } : {}),
          }),
        )) as { Items?: Array<Record<string, unknown>>; LastEvaluatedKey?: Record<string, unknown> };
        for (const item of result.Items ?? []) {
          const membership = parseMembershipItem(item);
          if (membership) {
            memberships.push(membership);
          }
        }
        startKey = result.LastEvaluatedKey;
        if (!startKey) {
          break;
        }
      }
      return memberships;
    },

    async deleteMembership(playerSub, tableId) {
      await client.send(
        new DeleteCommand({ TableName: tableName, Key: { PK: memberPk(playerSub), SK: membershipSk(tableId) } }),
      );
    },

    async listTableMembers(tableId) {
      const members: string[] = [];
      let startKey: Record<string, unknown> | undefined;
      for (let page = 0; page < MAX_TABLE_MEMBER_PAGES; page++) {
        const result = (await client.send(
          new QueryCommand({
            TableName: tableName,
            IndexName: BY_TABLE_INDEX,
            KeyConditionExpression: 'GSI1PK = :gsiPk AND begins_with(GSI1SK, :prefix)',
            ExpressionAttributeValues: { ':gsiPk': tableGsiPk(tableId), ':prefix': MEMBER_GSI_SK_PREFIX },
            ...(startKey ? { ExclusiveStartKey: startKey } : {}),
          }),
        )) as { Items?: Array<Record<string, unknown>>; LastEvaluatedKey?: Record<string, unknown> };
        for (const item of result.Items ?? []) {
          if (typeof item.playerSub === 'string') {
            members.push(item.playerSub);
          }
        }
        startKey = result.LastEvaluatedKey;
        if (!startKey) {
          break;
        }
      }
      return members;
    },

    async deleteTable(tableId, expectedVersion) {
      const seats = await this.listSeats(tableId);
      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Delete: {
                  TableName: tableName,
                  Key: { PK: tablePk(tableId), SK: META_SK },
                  ConditionExpression: '#version = :expected',
                  ExpressionAttributeNames: { '#version': 'version' },
                  ExpressionAttributeValues: { ':expected': expectedVersion },
                },
              },
              ...seats.map((seat) => ({
                Delete: { TableName: tableName, Key: { PK: tablePk(tableId), SK: seatSk(seat.seatId) } },
              })),
            ] as never,
          }),
        );
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
