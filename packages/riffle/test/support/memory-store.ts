import type { GroupTableMembership, MatchStore, NewGroupTable } from '../../src/runtime/store.js';
import { groupTableSk } from '../../src/runtime/keys.js';
import type { ConnectionRecord, SeatRecord, TableRecord } from '../../src/runtime/types.js';

export class MemoryMatchStore implements MatchStore {
  private connections = new Map<string, ConnectionRecord>();
  private tables = new Map<string, TableRecord>();
  private seats = new Map<string, SeatRecord>();
  private memberships: GroupTableMembership[] = [];

  private seatKey(tableId: string, seatId: string): string {
    return `${tableId}:${seatId}`;
  }

  async putConnection(connectionId: string): Promise<void> {
    this.connections.set(connectionId, { connectionId });
  }

  async deleteConnection(connectionId: string): Promise<void> {
    this.connections.delete(connectionId);
  }

  async getConnection(connectionId: string) {
    const row = this.connections.get(connectionId);
    return row ? { ...row } : null;
  }

  async createTable(tableId: string, createdAt: string): Promise<TableRecord> {
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
    this.tables.set(tableId, table);
    return table;
  }

  async bindConnectionToTable(connectionId: string, tableId: string): Promise<void> {
    const row = this.connections.get(connectionId);
    if (!row) {
      throw new Error('missing connection');
    }
    row.tableId = tableId;
  }

  async bindConnectionToSeat(connectionId: string, seatId: string): Promise<void> {
    const row = this.connections.get(connectionId);
    if (!row) {
      throw new Error('missing connection');
    }
    row.seatId = seatId;
  }

  async clearConnectionSeat(connectionId: string): Promise<void> {
    const row = this.connections.get(connectionId);
    if (row) {
      delete row.seatId;
    }
  }

  async getTable(tableId: string): Promise<TableRecord | null> {
    return this.tables.get(tableId) ?? null;
  }

  async incrementTableVersion(tableId: string, expectedVersion: number): Promise<TableRecord | null> {
    const table = this.tables.get(tableId);
    if (!table || table.version !== expectedVersion) {
      return null;
    }
    const updated = { ...table, version: table.version + 1 };
    this.tables.set(tableId, updated);
    return updated;
  }

  async listConnectionsForTable(tableId: string): Promise<string[]> {
    return [...this.connections.values()]
      .filter((row) => row.tableId === tableId)
      .map((row) => row.connectionId);
  }

  async getSeat(tableId: string, seatId: string): Promise<SeatRecord | null> {
    return this.seats.get(this.seatKey(tableId, seatId)) ?? null;
  }

  async listSeats(tableId: string): Promise<SeatRecord[]> {
    return [...this.seats.entries()]
      .filter(([key]) => key.startsWith(`${tableId}:`))
      .map(([, seat]) => seat)
      .sort((a, b) => Number(a.seatId) - Number(b.seatId));
  }

  async putSeat(tableId: string, seat: SeatRecord): Promise<void> {
    this.seats.set(this.seatKey(tableId, seat.seatId), { ...seat });
  }

  async deleteSeat(tableId: string, seatId: string): Promise<void> {
    this.seats.delete(this.seatKey(tableId, seatId));
  }

  async updateTableWithVersion(
    tableId: string,
    expectedVersion: number,
    table: TableRecord,
    seats: SeatRecord[],
  ): Promise<TableRecord | null> {
    const current = this.tables.get(tableId);
    if (!current || current.version !== expectedVersion) {
      return null;
    }
    this.tables.set(tableId, {
      ...table,
      groupId: table.groupId ?? current.groupId,
      tableName: table.tableName ?? current.tableName,
    });
    for (const seat of seats) {
      await this.putSeat(tableId, seat);
    }
    return this.tables.get(tableId)!;
  }

  async listGroupTables(groupId: string): Promise<GroupTableMembership[]> {
    return this.memberships
      .filter((row) => row.groupId === groupId)
      .sort((left, right) => (left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0));
  }

  async createGroupTable(input: NewGroupTable): Promise<TableRecord> {
    if (this.tables.has(input.tableId)) {
      throw new Error('table exists');
    }
    const table: TableRecord = {
      tableId: input.tableId,
      version: 1,
      status: 'open',
      createdAt: input.createdAt,
      defaultStack: input.defaultStack,
      maxSeats: input.maxSeats,
      blinds: input.blinds,
      groupId: input.groupId,
      tableName: input.tableName,
      handNumber: 0,
      pot: 0,
      board: [],
      street: null,
      currentSeatId: null,
    };
    this.tables.set(input.tableId, table);
    this.memberships.push({
      tableId: input.tableId,
      groupId: input.groupId,
      createdAt: input.createdAt,
      anchor: input.anchor,
      membershipSk: groupTableSk(input.createdAt, input.tableId),
    });
    return table;
  }

  async deleteTable(tableId: string, groupId: string, membershipSk: string): Promise<void> {
    this.tables.delete(tableId);
    for (const key of [...this.seats.keys()]) {
      if (key.startsWith(`${tableId}:`)) {
        this.seats.delete(key);
      }
    }
    this.memberships = this.memberships.filter(
      (row) => !(row.groupId === groupId && row.membershipSk === membershipSk),
    );
  }
}
