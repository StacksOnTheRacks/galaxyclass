import { sortSeats, type ScribbleStore } from './store.js';
import type { ConnectionRecord, SeatRecord, TableRecord } from './types.js';

/** In-process store for tests and the local dev harness. Values are cloned like a real database round-trip. */
export class MemoryScribbleStore implements ScribbleStore {
  readonly tables = new Map<string, TableRecord>();
  readonly seats = new Map<string, Map<string, SeatRecord>>();
  readonly connections = new Map<string, ConnectionRecord>();

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

  async bindConnectionToTable(connectionId: string, tableId: string) {
    const existing = this.connections.get(connectionId);
    if (existing) {
      this.connections.set(connectionId, { connectionId, tableId });
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

  async commit(change: Parameters<ScribbleStore['commit']>[0]) {
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
      const next: ConnectionRecord = { connectionId, ...(connection.tableId ? { tableId: connection.tableId } : {}) };
      if (seatId) {
        next.seatId = seatId;
      }
      this.connections.set(connectionId, next);
    }
    return true;
  }
}
