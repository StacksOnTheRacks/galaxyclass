import type { HandState, SeatState } from './types.js';

/** Per-hand metadata not stored on the public HandState JSON shape. */
export type HandMeta = {
  actedThisStreet: Set<string>;
  lastAggressorSeatId: string | null;
  /** Seats matched the bet before the most recent short all-in on this street. */
  shortAllInMatchedFromBet: number | null;
};

const handMeta = new WeakMap<HandState, HandMeta>();

export function getHandMeta(state: HandState): HandMeta {
  let meta = handMeta.get(state);
  if (!meta) {
    meta = {
      actedThisStreet: new Set(),
      lastAggressorSeatId: null,
      shortAllInMatchedFromBet: null,
    };
    handMeta.set(state, meta);
  }
  return meta;
}

export function cloneHandMeta(from: HandState, to: HandState): void {
  const source = handMeta.get(from);
  if (source) {
    handMeta.set(to, {
      actedThisStreet: new Set(source.actedThisStreet),
      lastAggressorSeatId: source.lastAggressorSeatId,
      shortAllInMatchedFromBet: source.shortAllInMatchedFromBet,
    });
  }
}

export function cloneHandState(state: HandState): HandState {
  const clone: HandState = {
    ...state,
    board: [...state.board],
    burns: [...state.burns],
    deckRemaining: [...state.deckRemaining],
    winners: state.winners ? state.winners.map((w) => ({ ...w })) : null,
    seats: state.seats.map((seat) => ({
      ...seat,
      hole: [seat.hole[0], seat.hole[1]] as [typeof seat.hole[0], typeof seat.hole[1]],
    })),
  };
  cloneHandMeta(state, clone);
  return clone;
}

export function seatIndex(state: HandState, seatId: string): number {
  const index = state.seats.findIndex((s) => s.seatId === seatId);
  if (index === -1) {
    throw new Error(`Unknown seatId: ${seatId}`);
  }
  return index;
}

export function stillInSeats(state: HandState): SeatState[] {
  return state.seats.filter((s) => !s.folded);
}

export function nextSeatClockwise(state: HandState, fromSeatId: string): SeatState | null {
  const n = state.seats.length;
  const start = seatIndex(state, fromSeatId);
  for (let offset = 1; offset <= n; offset += 1) {
    const seat = state.seats[(start + offset) % n];
    if (!seat.folded) {
      return seat;
    }
  }
  return null;
}

export function smallBlindSeatId(state: HandState): string {
  if (state.seats.length === 2) {
    return state.buttonSeatId;
  }
  const afterButton = nextSeatClockwise(state, state.buttonSeatId);
  return afterButton!.seatId;
}

export function bigBlindSeatId(state: HandState): string {
  const sb = smallBlindSeatId(state);
  const afterSb = nextSeatClockwise(state, sb);
  return afterSb!.seatId;
}

export function firstToActPreflop(state: HandState): string {
  if (state.seats.length === 2) {
    return state.buttonSeatId;
  }
  const bb = bigBlindSeatId(state);
  const afterBb = nextSeatClockwise(state, bb);
  return afterBb!.seatId;
}

export function firstToActPostflop(state: HandState): string {
  const afterButton = nextSeatClockwise(state, state.buttonSeatId);
  return afterButton!.seatId;
}

export function postBlind(seat: SeatState, amount: number, pot: number): number {
  seat.stack -= amount;
  seat.streetCommitted += amount;
  seat.handCommitted += amount;
  return pot + amount;
}

export function toCall(seat: SeatState, currentBet: number): number {
  return currentBet - seat.streetCommitted;
}

export function seatNeedsAction(state: HandState, seat: SeatState, meta: HandMeta): boolean {
  if (seat.folded || seat.allIn || seat.stack === 0) {
    return false;
  }
  if (
    meta.shortAllInMatchedFromBet !== null &&
    seat.streetCommitted >= meta.shortAllInMatchedFromBet
  ) {
    return false;
  }
  if (toCall(seat, state.currentBet) > 0) {
    return true;
  }
  if (!meta.actedThisStreet.has(seat.seatId)) {
    return true;
  }
  return false;
}

export function nextActorSeatId(state: HandState, meta: HandMeta, afterSeatId: string | null): string | null {
  const stillIn = stillInSeats(state);
  if (stillIn.length <= 1) {
    return null;
  }

  const n = state.seats.length;
  let start: number;
  let firstOffset: number;

  if (afterSeatId === null) {
    const startId =
      state.street === 'preflop' ? firstToActPreflop(state) : firstToActPostflop(state);
    start = seatIndex(state, startId);
    firstOffset = 0;
  } else {
    start = seatIndex(state, afterSeatId);
    firstOffset = 1;
  }

  for (let offset = firstOffset; offset < n + firstOffset; offset += 1) {
    const seat = state.seats[(start + offset) % n];
    if (seatNeedsAction(state, seat, meta)) {
      return seat.seatId;
    }
  }
  return null;
}

export function isBettingComplete(state: HandState, meta: HandMeta): boolean {
  const stillIn = stillInSeats(state);
  if (stillIn.length <= 1) {
    return true;
  }
  if (!stillIn.every((s) => s.streetCommitted === state.currentBet)) {
    return false;
  }
  return nextActorSeatId(state, meta, null) === null;
}

export function maxBetOrRaiseAmount(
  state: HandState,
  actor: SeatState,
  newCurrentBet: number,
): number {
  const chipsToAdd = newCurrentBet - actor.streetCommitted;
  if (chipsToAdd >= actor.stack) {
    return -1;
  }
  for (const seat of stillInSeats(state)) {
    if (seat.seatId === actor.seatId) {
      continue;
    }
    const toMatch = newCurrentBet - seat.streetCommitted;
    if (toMatch >= seat.stack) {
      return -1;
    }
  }
  return newCurrentBet;
}

export function minOpeningWager(state: HandState): number {
  return state.blinds.bigBlind;
}

export function minRaiseTo(state: HandState): number {
  return state.currentBet + state.lastRaiseSize;
}

export function awardRemainderClockwiseFromButton(
  state: HandState,
  tiedSeatIds: string[],
  remainder: number,
): Map<string, number> {
  const awards = new Map<string, number>();
  for (const id of tiedSeatIds) {
    awards.set(id, 0);
  }
  if (remainder <= 0) {
    return awards;
  }

  const order: string[] = [];
  let cursor = state.buttonSeatId;
  for (let i = 0; i < state.seats.length; i += 1) {
    const next = nextSeatClockwise(state, cursor);
    if (!next) {
      break;
    }
    cursor = next.seatId;
    if (tiedSeatIds.includes(cursor)) {
      order.push(cursor);
    }
  }

  let chips = remainder;
  let idx = 0;
  while (chips > 0 && order.length > 0) {
    const seatId = order[idx % order.length];
    awards.set(seatId, (awards.get(seatId) ?? 0) + 1);
    chips -= 1;
    idx += 1;
  }
  return awards;
}
