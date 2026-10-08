import { sortSeats, type TableCommit, type WhodunitStore } from './store.js';
import type { ConnectionRecord, MembershipRecord, SeatRecord, TableRecord } from './types.js';

/** In-process store for tests and the local dev harness. Values are cloned like a real database round-trip. */
export class MemoryWhodunitStore implements WhodunitStore {
  readonly tables = new Map<string, TableRecord>();
  readonly seats = new Map<string, Map<string, SeatRecord>>();
  readonly connections = new Map<string, ConnectionRecord>();
  /** Keyed by player sub, then table id. */
  readonly memberships = new Map<string, Map<string, MembershipRecord>>();

  async createTable(table: TableRecord, owner: MembershipRecord) {
    if (this.tables.has(table.tableId)) {
      throw new Error(`table ${table.tableId} already exists`);
    }
    await this.putTable(table);
    await this.addMembership(owner);
  }

  async addMembership(membership: MembershipRecord) {
    const mine = this.memberships.get(membership.playerSub) ?? new Map<string, MembershipRecord>();
    if (!mine.has(membership.tableId)) {
      mine.set(membership.tableId, structuredClone(membership));
    }
    this.memberships.set(membership.playerSub, mine);
  }

  async listMemberships(playerSub: string) {
    return [...(this.memberships.get(playerSub)?.values() ?? [])].map((m) => structuredClone(m));
  }

  async deleteMembership(playerSub: string, tableId: string) {
    this.memberships.get(playerSub)?.delete(tableId);
  }

  async listTableMembers(tableId: string) {
    return [...this.memberships.entries()].filter(([, mine]) => mine.has(tableId)).map(([playerSub]) => playerSub);
  }

  async deleteTable(tableId: string, expectedVersion: number) {
    if (this.tables.get(tableId)?.version !== expectedVersion) {
      return false;
    }
    this.tables.delete(tableId);
    this.seats.delete(tableId);
    return true;
  }

  async putConnection(connectionId: string) {
    this.connections.set(connectionId, { connectionId });
  }

  async deleteConnection(connectionId: string) {
    this.connections.delete(connectionId);
  }

  async getConnection(connectionId: string) {
    const connection = this.connections.get(connectionId);
    return connection ? structuredClone(connection) : null;
  }

  async bindConnectionToTable(connectionId: string, tableId: string, playerSub: string) {
    const existing = this.connections.get(connectionId);
    if (existing) {
      this.connections.set(connectionId, { connectionId, tableId, playerSub });
    }
  }

  async listConnectionsForTable(tableId: string) {
    return [...this.connections.values()].filter((c) => c.tableId === tableId).map((c) => c.connectionId);
  }

  async getTable(tableId: string) {
    const table = this.tables.get(tableId);
    return table ? structuredClone(table) : null;
  }

  async putTable(table: TableRecord) {
    this.tables.set(table.tableId, structuredClone(table));
    if (!this.seats.has(table.tableId)) {
      this.seats.set(table.tableId, new Map());
    }
  }

  async listSeats(tableId: string) {
    return sortSeats([...(this.seats.get(tableId)?.values() ?? [])].map((seat) => structuredClone(seat)));
  }

  async commit(change: TableCommit) {
    const stored = this.tables.get(change.table.tableId);
    if (!stored || stored.version !== change.expectedVersion) {
      return false;
    }
    this.tables.set(change.table.tableId, structuredClone(change.table));
    const seats = this.seats.get(change.table.tableId) ?? new Map<string, SeatRecord>();
    for (const seatId of change.deleteSeatIds) {
      seats.delete(seatId);
    }
    for (const seat of change.putSeats) {
      seats.set(seat.seatId, structuredClone(seat));
    }
    this.seats.set(change.table.tableId, seats);
    for (const { connectionId, seatId } of change.connectionSeats) {
      const connection = this.connections.get(connectionId);
      if (!connection) {
        continue;
      }
      const next: ConnectionRecord = {
        connectionId,
        ...(connection.tableId ? { tableId: connection.tableId } : {}),
        ...(connection.playerSub ? { playerSub: connection.playerSub } : {}),
      };
      if (seatId) {
        next.seatId = seatId as ConnectionRecord['seatId'];
      }
      this.connections.set(connectionId, next);
    }
    return true;
  }
}
