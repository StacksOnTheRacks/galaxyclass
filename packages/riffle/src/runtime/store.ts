import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  connGsiSk,
  connPk,
  META_SK,
  seatSk,
  tableGsiPk,
  tablePk,
} from './keys.js';
import type { ConnectionRecord, RuntimeEnv, SeatRecord, TableRecord } from './types.js';

export interface MatchStore {
  putConnection(connectionId: string): Promise<void>;
  deleteConnection(connectionId: string): Promise<void>;
  getConnection(connectionId: string): Promise<ConnectionRecord | null>;
  createTable(tableId: string, createdAt: string): Promise<TableRecord>;
  bindConnectionToTable(connectionId: string, tableId: string): Promise<void>;
  bindConnectionToSeat(connectionId: string, seatId: string): Promise<void>;
  clearConnectionSeat(connectionId: string): Promise<void>;
  getTable(tableId: string): Promise<TableRecord | null>;
  incrementTableVersion(tableId: string, expectedVersion: number): Promise<TableRecord | null>;
  listConnectionsForTable(tableId: string): Promise<string[]>;
  getSeat(tableId: string, seatId: string): Promise<SeatRecord | null>;
  listSeats(tableId: string): Promise<SeatRecord[]>;
  putSeat(tableId: string, seat: SeatRecord): Promise<void>;
  deleteSeat(tableId: string, seatId: string): Promise<void>;
  updateTableWithVersion(
    tableId: string,
    expectedVersion: number,
    table: TableRecord,
    seats: SeatRecord[],
  ): Promise<TableRecord | null>;
}

function parseTableItem(item: Record<string, unknown>): TableRecord {
  return {
    tableId: String(item.tableId),
    version: Number(item.version),
    status: item.status === 'hand_in_progress' ? 'hand_in_progress' : 'open',
    createdAt: String(item.createdAt),
    defaultStack: Number(item.defaultStack ?? 2000),
    maxSeats: Number(item.maxSeats ?? 8),
    blinds: {
      smallBlind: Number((item.blinds as { smallBlind?: number })?.smallBlind ?? 1),
      bigBlind: Number((item.blinds as { bigBlind?: number })?.bigBlind ?? 2),
    },
    handNumber: Number(item.handNumber ?? 0),
    buttonSeatId: item.buttonSeatId ? String(item.buttonSeatId) : undefined,
    street: item.street ? (String(item.street) as TableRecord['street']) : null,
    currentSeatId:
      item.currentSeatId === undefined || item.currentSeatId === null
        ? null
        : String(item.currentSeatId),
    pot: item.pot === undefined ? 0 : Number(item.pot),
    board: Array.isArray(item.board) ? (item.board as TableRecord['board']) : [],
    phase: item.phase ? (String(item.phase) as TableRecord['phase']) : null,
    currentBet: item.currentBet === undefined ? undefined : Number(item.currentBet),
    lastRaiseSize:
      item.lastRaiseSize === undefined ? undefined : Number(item.lastRaiseSize),
    deckRemaining: Array.isArray(item.deckRemaining)
      ? (item.deckRemaining as TableRecord['deckRemaining'])
      : [],
    burns: Array.isArray(item.burns) ? (item.burns as TableRecord['burns']) : [],
    actedThisStreet: Array.isArray(item.actedThisStreet)
      ? item.actedThisStreet.map(String)
      : [],
    lastAggressorSeatId:
      item.lastAggressorSeatId === undefined || item.lastAggressorSeatId === null
        ? null
        : String(item.lastAggressorSeatId),
    shortAllInMatchedFromBet:
      item.shortAllInMatchedFromBet === undefined || item.shortAllInMatchedFromBet === null
        ? null
        : Number(item.shortAllInMatchedFromBet),
    pots: Array.isArray(item.pots) ? (item.pots as TableRecord['pots']) : undefined,
    winners: Array.isArray(item.winners) ? (item.winners as TableRecord['winners']) : undefined,
    completeReason:
      item.completeReason === 'fold_to_one' || item.completeReason === 'showdown'
        ? item.completeReason
        : null,
  };
}

function parseSeatItem(item: Record<string, unknown>): SeatRecord {
  const seat: SeatRecord = {
    seatId: String(item.seatId),
    displayName: String(item.displayName),
    stack: Number(item.stack),
    seatTokenHash: String(item.seatTokenHash),
    connectionId: item.connectionId ? String(item.connectionId) : undefined,
    folded: item.folded === true,
    streetCommitted: Number(item.streetCommitted ?? 0),
    handCommitted: Number(item.handCommitted ?? 0),
    allIn: item.allIn === true,
  };
  if (item.awaySince) {
    seat.awaySince = String(item.awaySince);
  }
  if (item.leaveAfterHand === true) {
    seat.leaveAfterHand = true;
  }
  if (Array.isArray(item.hole) && item.hole.length === 2) {
    seat.hole = [String(item.hole[0]), String(item.hole[1])] as SeatRecord['hole'];
  }
  return seat;
}

function seatItem(tableId: string, seat: SeatRecord): Record<string, unknown> {
  const item: Record<string, unknown> = { PK: tablePk(tableId), SK: seatSk(seat.seatId) };
  for (const [key, value] of Object.entries(seat)) {
    if (value !== undefined) {
      item[key] = value;
    }
  }
  return item;
}

export function createMatchStore(
  client: DynamoDBDocumentClient,
  env: RuntimeEnv,
): MatchStore {
  const tableName = env.tableName;

  return {
    async putConnection(connectionId) {
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            PK: connPk(connectionId),
            SK: META_SK,
            connectionId,
          },
        }),
      );
    },

    async deleteConnection(connectionId) {
      await client.send(
        new DeleteCommand({
          TableName: tableName,
          Key: {
            PK: connPk(connectionId),
            SK: META_SK,
          },
        }),
      );
    },

    async getConnection(connectionId) {
      const result = await client.send(
        new GetCommand({
          TableName: tableName,
          Key: {
            PK: connPk(connectionId),
            SK: META_SK,
          },
        }),
      );

      if (!result.Item) {
        return null;
      }

      return {
        connectionId: String(result.Item.connectionId),
        tableId: result.Item.tableId ? String(result.Item.tableId) : undefined,
        seatId: result.Item.seatId ? String(result.Item.seatId) : undefined,
      };
    },

    async createTable(tableId, createdAt) {
      const table: TableRecord = {
        tableId,
        version: 1,
        status: 'open',
        createdAt,
        defaultStack: 2000,
        maxSeats: 8,
        blinds: { smallBlind: 1, bigBlind: 2 },
        handNumber: 0,
        pot: 0,
        board: [],
        street: null,
        currentSeatId: null,
      };

      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            PK: tablePk(tableId),
            SK: META_SK,
            ...table,
          },
        }),
      );

      return table;
    },

    async bindConnectionToTable(connectionId, tableId) {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: {
            PK: connPk(connectionId),
            SK: META_SK,
          },
          UpdateExpression:
            'SET tableId = :tableId, GSI1PK = :gsiPk, GSI1SK = :gsiSk',
          ExpressionAttributeValues: {
            ':tableId': tableId,
            ':gsiPk': tableGsiPk(tableId),
            ':gsiSk': connGsiSk(connectionId),
          },
        }),
      );
    },

    async bindConnectionToSeat(connectionId, seatId) {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: {
            PK: connPk(connectionId),
            SK: META_SK,
          },
          UpdateExpression: 'SET seatId = :seatId',
          ExpressionAttributeValues: {
            ':seatId': seatId,
          },
        }),
      );
    },

    async clearConnectionSeat(connectionId) {
      await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: {
            PK: connPk(connectionId),
            SK: META_SK,
          },
          UpdateExpression: 'REMOVE seatId',
        }),
      );
    },

    async getTable(tableId) {
      const result = await client.send(
        new GetCommand({
          TableName: tableName,
          Key: {
            PK: tablePk(tableId),
            SK: META_SK,
          },
        }),
      );

      if (!result.Item) {
        return null;
      }

      return parseTableItem(result.Item);
    },

    async incrementTableVersion(tableId, expectedVersion) {
      try {
        const result = await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: {
              PK: tablePk(tableId),
              SK: META_SK,
            },
            UpdateExpression: 'SET #version = :nextVersion',
            ConditionExpression: '#version = :expectedVersion',
            ExpressionAttributeNames: {
              '#version': 'version',
            },
            ExpressionAttributeValues: {
              ':expectedVersion': expectedVersion,
              ':nextVersion': expectedVersion + 1,
            },
            ReturnValues: 'ALL_NEW',
          }),
        );

        if (!result.Attributes) {
          return null;
        }

        return parseTableItem(result.Attributes);
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'name' in error &&
          error.name === 'ConditionalCheckFailedException'
        ) {
          return null;
        }
        throw error;
      }
    },

    async listConnectionsForTable(tableId) {
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: 'byTable',
          KeyConditionExpression: 'GSI1PK = :gsiPk',
          ExpressionAttributeValues: {
            ':gsiPk': tableGsiPk(tableId),
          },
        }),
      );

      return (result.Items ?? []).map((item) => String(item.connectionId));
    },

    async getSeat(tableId, seatId) {
      const result = await client.send(
        new GetCommand({
          TableName: tableName,
          Key: {
            PK: tablePk(tableId),
            SK: seatSk(seatId),
          },
        }),
      );

      if (!result.Item) {
        return null;
      }

      return parseSeatItem(result.Item);
    },

    async listSeats(tableId) {
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
          ExpressionAttributeValues: {
            ':pk': tablePk(tableId),
            ':skPrefix': 'SEAT#',
          },
        }),
      );

      return (result.Items ?? [])
        .map((item) => parseSeatItem(item))
        .sort((a, b) => Number(a.seatId) - Number(b.seatId));
    },

    async putSeat(tableId, seat) {
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: seatItem(tableId, seat),
        }),
      );
    },

    async deleteSeat(tableId, seatId) {
      await client.send(
        new DeleteCommand({
          TableName: tableName,
          Key: {
            PK: tablePk(tableId),
            SK: seatSk(seatId),
          },
        }),
      );
    },

    async updateTableWithVersion(tableId, expectedVersion, table, seats) {
      try {
        await client.send(
          new UpdateCommand({
            TableName: tableName,
            Key: {
              PK: tablePk(tableId),
              SK: META_SK,
            },
            UpdateExpression:
              'SET #version = :nextVersion, #status = :status, handNumber = :handNumber, buttonSeatId = :buttonSeatId, street = :street, currentSeatId = :currentSeatId, pot = :pot, #board = :board, #phase = :phase, currentBet = :currentBet, lastRaiseSize = :lastRaiseSize, deckRemaining = :deckRemaining, burns = :burns, actedThisStreet = :actedThisStreet, lastAggressorSeatId = :lastAggressorSeatId, shortAllInMatchedFromBet = :shortAllInMatchedFromBet, pots = :pots, winners = :winners, completeReason = :completeReason',
            ConditionExpression: '#version = :expectedVersion',
            ExpressionAttributeNames: {
              '#version': 'version',
              '#status': 'status',
              '#board': 'board',
              '#phase': 'phase',
            },
            ExpressionAttributeValues: {
              ':expectedVersion': expectedVersion,
              ':nextVersion': table.version,
              ':status': table.status,
              ':handNumber': table.handNumber,
              ':buttonSeatId': table.buttonSeatId ?? null,
              ':street': table.street ?? null,
              ':currentSeatId': table.currentSeatId ?? null,
              ':pot': table.pot ?? 0,
              ':board': table.board ?? [],
              ':phase': table.phase ?? null,
              ':currentBet': table.currentBet ?? null,
              ':lastRaiseSize': table.lastRaiseSize ?? null,
              ':deckRemaining': table.deckRemaining ?? [],
              ':burns': table.burns ?? [],
              ':actedThisStreet': table.actedThisStreet ?? [],
              ':lastAggressorSeatId': table.lastAggressorSeatId ?? null,
              ':shortAllInMatchedFromBet': table.shortAllInMatchedFromBet ?? null,
              ':pots': table.pots ?? null,
              ':winners': table.winners ?? null,
              ':completeReason': table.completeReason ?? null,
            },
          }),
        );

        for (const seat of seats) {
          await client.send(
            new PutCommand({
              TableName: tableName,
              Item: seatItem(tableId, seat),
            }),
          );
        }

        return table;
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'name' in error &&
          error.name === 'ConditionalCheckFailedException'
        ) {
          return null;
        }
        throw error;
      }
    },
  };
}
