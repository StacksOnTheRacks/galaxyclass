import { isBetweenHands, isSeatAway } from './hand-state.js';
import type { MatchStore } from './store.js';
import type { SeatRecord, TableRecord } from './types.js';

/** Long enough to survive a refresh or brief network drop; the seat token dies with the tab anyway. */
export const AWAY_GRACE_MS = 60_000;

export function findDepartedSeats(
  table: TableRecord,
  seats: SeatRecord[],
  nowMs: number,
): SeatRecord[] {
  if (!isBetweenHands(table)) {
    return [];
  }
  return seats.filter((seat) => {
    if (seat.leaveAfterHand) {
      return true;
    }
    if (!isSeatAway(seat)) {
      return false;
    }
    // Seats that went away before away tracking existed have no timestamp.
    const since = seat.awaySince ? Date.parse(seat.awaySince) : Number.NaN;
    return Number.isNaN(since) || nowMs - since >= AWAY_GRACE_MS;
  });
}

export interface ReapResult {
  table: TableRecord;
  seats: SeatRecord[];
  reaped: boolean;
}

/** Removes seats whose players have left, between hands only. */
export async function reapDepartedSeats(
  store: MatchStore,
  table: TableRecord,
  seats: SeatRecord[],
  now: string,
): Promise<ReapResult> {
  const departed = findDepartedSeats(table, seats, Date.parse(now));
  if (departed.length === 0) {
    return { table, seats, reaped: false };
  }

  const updated = await store.incrementTableVersion(table.tableId, table.version);
  if (!updated) {
    const fresh = await store.getTable(table.tableId);
    return { table: fresh ?? table, seats: await store.listSeats(table.tableId), reaped: false };
  }

  const departedIds = new Set(departed.map((seat) => seat.seatId));
  for (const seatId of departedIds) {
    await store.deleteSeat(table.tableId, seatId);
  }

  return {
    table: updated,
    seats: seats.filter((seat) => !departedIds.has(seat.seatId)),
    reaped: true,
  };
}
