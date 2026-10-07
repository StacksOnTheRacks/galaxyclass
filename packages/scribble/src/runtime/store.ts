import type { ConnectionRecord, MembershipRecord, SeatRecord, TableRecord } from './types.js';

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
  /** Writes a new table and its owner's membership together. */
  createTable(table: TableRecord, owner: MembershipRecord): Promise<void>;
  /** Keeps the first record when the member already belongs to the table. */
  addMembership(membership: MembershipRecord): Promise<void>;
  listMemberships(playerSub: string): Promise<MembershipRecord[]>;
  deleteMembership(playerSub: string, tableId: string): Promise<void>;
  /** Player subs with the table on their list. */
  listTableMembers(tableId: string): Promise<string[]>;
  /** Deletes the table and its seats, conditioned on `expectedVersion`. False when another write got there first. */
  deleteTable(tableId: string, expectedVersion: number): Promise<boolean>;
}

export function sortSeats(seats: SeatRecord[]): SeatRecord[] {
  return [...seats].sort((a, b) => Number(a.seatId) - Number(b.seatId));
}
