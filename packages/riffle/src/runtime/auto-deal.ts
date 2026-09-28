import { fanOutSeatScopedSnapshots, type FanoutDeps } from './fanout.js';
import { clearSeatHand } from './hand-state.js';
import { reapDepartedSeats } from './reap.js';
import { dealableSeats, dealNextHand } from './start-hand.js';
import type { SeatRecord, TableRecord } from './types.js';

/** How long the finished hand (and the win banner) stays up before the next deal. */
export const NEXT_HAND_DELAY_MS = 3000;

const MAX_ATTEMPTS = 3;

export interface AutoDealDeps extends FanoutDeps {
  now: () => string;
  rngSeed?: () => number;
}

export function isHandComplete(table: TableRecord): boolean {
  return table.status === 'hand_in_progress' && table.phase === 'complete';
}

/** Deals the first hand once a table with no hand has two players ready. */
export async function dealIfReady(
  deps: AutoDealDeps,
  table: TableRecord,
  seats: SeatRecord[],
): Promise<boolean> {
  if (table.status !== 'open' || dealableSeats(seats).length < 2) {
    return false;
  }
  const result = await dealNextHand(deps.store, table, seats, deps.rngSeed?.());
  if (!result.ok) {
    return false;
  }
  await fanOutSeatScopedSnapshots(deps, result.table, result.seats);
  return true;
}

function openTable(table: TableRecord): TableRecord {
  return {
    ...table,
    version: table.version + 1,
    status: 'open',
    street: null,
    currentSeatId: null,
    pot: 0,
    board: [],
    phase: null,
    currentBet: undefined,
    lastRaiseSize: undefined,
    deckRemaining: [],
    burns: [],
    actedThisStreet: [],
    lastAggressorSeatId: null,
    shortAllInMatchedFromBet: null,
    pots: undefined,
    winners: null,
    completeReason: null,
    streetActions: [],
  };
}

/**
 * After a hand finishes, waits so everyone sees the result, then deals the
 * next hand, or returns the table to open when fewer than two can play.
 * Safe to run more than once for the same hand: only the first to act wins.
 */
export async function continueAfterHand(
  deps: AutoDealDeps,
  tableId: string,
  handNumber: number,
  delayMs: number,
): Promise<void> {
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const stored = await deps.store.getTable(tableId);
    if (!stored || !isHandComplete(stored) || stored.handNumber !== handNumber) {
      return;
    }
    const { table, seats } = await reapDepartedSeats(
      deps.store,
      stored,
      await deps.store.listSeats(tableId),
      deps.now(),
    );

    if (dealableSeats(seats).length >= 2) {
      const dealt = await dealNextHand(deps.store, table, seats, deps.rngSeed?.());
      if (dealt.ok) {
        await fanOutSeatScopedSnapshots(deps, dealt.table, dealt.seats);
        return;
      }
      continue;
    }

    const opened = openTable(table);
    const clearedSeats = seats.map(clearSeatHand);
    const persisted = await deps.store.updateTableWithVersion(
      tableId,
      table.version,
      opened,
      clearedSeats,
    );
    if (persisted) {
      await fanOutSeatScopedSnapshots(deps, opened, clearedSeats);
      return;
    }
  }
}
