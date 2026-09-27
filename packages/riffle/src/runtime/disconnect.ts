import { foldAwayActors } from './act.js';
import type { MatchStore } from './store.js';
import type { SeatRecord, TableRecord } from './types.js';

export interface SeatDisconnectResult {
  table: TableRecord;
  seats: SeatRecord[];
}

const MAX_ATTEMPTS = 3;

/**
 * Marks the seat bound to a closed connection as away (keeping it reclaimable
 * by seat token) and folds it if the action is on that seat.
 */
export async function handleSeatDisconnect(
  store: MatchStore,
  tableId: string,
  seatId: string,
  connectionId: string,
  now: string,
): Promise<SeatDisconnectResult | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const table = await store.getTable(tableId);
    if (!table) {
      return null;
    }
    const seats = await store.listSeats(tableId);
    const seat = seats.find((row) => row.seatId === seatId);
    if (!seat || seat.connectionId !== connectionId) {
      return null;
    }

    const { connectionId: _dropped, ...rest } = seat;
    const awaySeat: SeatRecord = { ...rest, awaySince: now };
    const marked = seats.map((row) => (row.seatId === seatId ? awaySeat : row));
    const folded = foldAwayActors({ ...table, version: table.version + 1 }, marked);

    const persisted = await store.updateTableWithVersion(
      tableId,
      table.version,
      folded.table,
      folded.seats,
    );
    if (persisted) {
      return folded;
    }
  }

  return null;
}
