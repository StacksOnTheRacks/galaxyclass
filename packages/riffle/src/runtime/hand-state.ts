import { getHandMeta } from '../rules/state.js';
import type { Card, HandState, Phase } from '../rules/types.js';
import type { SeatRecord, TableRecord } from './types.js';

export function isBetweenHands(table: TableRecord): boolean {
  return table.status !== 'hand_in_progress' || table.phase === 'complete';
}

export function isSeatAway(seat: SeatRecord): boolean {
  return !seat.connectionId;
}

export function clearSeatHand(seat: SeatRecord): SeatRecord {
  const { hole: _hole, folded: _folded, streetCommitted: _street, handCommitted: _hand, allIn: _allIn, ...rest } =
    seat;
  return rest;
}

export function rehydrateHandState(
  table: TableRecord,
  seats: SeatRecord[],
): HandState | null {
  if (table.status !== 'hand_in_progress' || !table.buttonSeatId) {
    return null;
  }

  const inHand = seats.filter((seat) => seat.hole);
  if (inHand.length === 0) {
    return null;
  }

  const phase: Phase = table.phase ?? 'betting';
  const currentBet =
    table.currentBet ?? (phase === 'betting' ? table.blinds.bigBlind : 0);

  const handState: HandState = {
    seats: inHand.map((seat) => ({
      seatId: seat.seatId,
      stack: seat.stack,
      hole: [seat.hole![0], seat.hole![1]],
      folded: seat.folded ?? false,
      allIn: seat.allIn ?? false,
      streetCommitted: seat.streetCommitted ?? 0,
      handCommitted: seat.handCommitted ?? 0,
    })),
    buttonSeatId: table.buttonSeatId,
    blinds: { ...table.blinds },
    street: table.street ?? 'preflop',
    phase,
    currentSeatId: table.currentSeatId ?? null,
    board: [...(table.board ?? [])],
    pot: table.pot ?? 0,
    pots: table.pots ? table.pots.map((pot) => ({ ...pot, eligibleSeatIds: [...pot.eligibleSeatIds] })) : undefined,
    currentBet,
    lastRaiseSize: table.lastRaiseSize ?? table.blinds.bigBlind,
    deckRemaining: [...(table.deckRemaining ?? [])],
    burns: [...(table.burns ?? [])],
    winners: table.winners ? table.winners.map((winner) => ({ ...winner })) : null,
    completeReason: table.completeReason ?? null,
  };

  const meta = getHandMeta(handState);
  meta.actedThisStreet = new Set(table.actedThisStreet ?? []);
  meta.lastAggressorSeatId = table.lastAggressorSeatId ?? null;
  meta.shortAllInMatchedFromBet = table.shortAllInMatchedFromBet ?? null;

  return handState;
}

export function extractHandMeta(table: TableRecord, handState: HandState): TableRecord {
  const meta = getHandMeta(handState);
  return {
    ...table,
    phase: handState.phase,
    currentBet: handState.currentBet,
    lastRaiseSize: handState.lastRaiseSize,
    deckRemaining: [...handState.deckRemaining],
    burns: [...handState.burns],
    actedThisStreet: [...meta.actedThisStreet],
    lastAggressorSeatId: meta.lastAggressorSeatId,
    shortAllInMatchedFromBet: meta.shortAllInMatchedFromBet,
    pots: handState.pots?.map((pot) => ({
      ...pot,
      eligibleSeatIds: [...pot.eligibleSeatIds],
    })),
    winners: handState.winners ? handState.winners.map((winner) => ({ ...winner })) : null,
    completeReason: handState.completeReason,
  };
}

export function applyHandStateToSeats(handState: HandState, seats: SeatRecord[]): SeatRecord[] {
  return seats.map((seat) => {
    const handSeat = handState.seats.find((row) => row.seatId === seat.seatId);
    if (!handSeat) {
      return seat;
    }
    return {
      ...seat,
      stack: handSeat.stack,
      hole: [handSeat.hole[0], handSeat.hole[1]] as [Card, Card],
      folded: handSeat.folded,
      allIn: handSeat.allIn ?? false,
      streetCommitted: handSeat.streetCommitted,
      handCommitted: handSeat.handCommitted,
    };
  });
}

export function applyHandStateToTable(
  table: TableRecord,
  handState: HandState,
  nextVersion: number,
): TableRecord {
  const withMeta = extractHandMeta(table, handState);
  return {
    ...withMeta,
    version: nextVersion,
    status: 'hand_in_progress',
    street: handState.street,
    currentSeatId: handState.currentSeatId,
    pot: handState.pot,
    board: [...handState.board],
  };
}
