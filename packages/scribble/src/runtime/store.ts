import type { ConnectionRecord, SeatRecord, TableRecord } from './types.js';

export interface TableCommit {
  /** Written whole, conditioned on the stored version still being `expectedVersion`. */
  table: TableRecord;
  expectedVersion: number;
  putSeats: SeatRecord[];
  deleteSeatIds: string[];
  /** Connection seat bindings to update in the same transaction (`null` clears). */
  connectionSeats: Array<{ connectionId: string; seatId: string | null }>;
}

export interface ScribbleStore {
  putConnection(connectionId: string): Promise<void>;
  deleteConnection(connectionId: string): Promise<void>;
  getConnection(connectionId: string): Promise<ConnectionRecord | null>;
  bindConnectionToTable(connectionId: string, tableId: string): Promise<void>;
  listConnectionsForTable(tableId: string): Promise<string[]>;
  getTable(tableId: string): Promise<TableRecord | null>;
  putTable(table: TableRecord): Promise<void>;
  listSeats(tableId: string): Promise<SeatRecord[]>;
  /** Atomically applies a turn. Returns false when another write got there first. */
  commit(change: TableCommit): Promise<boolean>;
}

export function sortSeats(seats: SeatRecord[]): SeatRecord[] {
  return [...seats].sort((a, b) => Number(a.seatId) - Number(b.seatId));
}
