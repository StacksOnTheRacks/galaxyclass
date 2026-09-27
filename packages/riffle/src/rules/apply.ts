import { legalize } from './legalize.js';
import { err, ok } from './errors.js';
import {
  cloneHandState,
  getHandMeta,
  isBettingComplete,
  nextActorSeatId,
  seatIndex,
  stillInSeats,
} from './state.js';
import { seatsWithChipsRemaining } from './pots.js';
import type { Action, HandState, LegalizedAction, Result, RulesOptions } from './types.js';

function commitChips(state: HandState, seatId: string, amount: number): void {
  const seat = state.seats[seatIndex(state, seatId)];
  seat.stack -= amount;
  seat.streetCommitted += amount;
  seat.handCommitted += amount;
  state.pot += amount;
  if (seat.stack === 0) {
    seat.allIn = true;
  }
}

function applyLegalized(state: HandState, seatId: string, action: LegalizedAction): void {
  const meta = getHandMeta(state);
  meta.actedThisStreet.add(seatId);

  switch (action.type) {
    case 'fold':
      state.seats[seatIndex(state, seatId)].folded = true;
      break;
    case 'check':
      break;
    case 'call':
      commitChips(state, seatId, action.amount);
      break;
    case 'bet': {
      const previousBet = state.currentBet;
      commitChips(state, seatId, action.amount);
      const seat = state.seats[seatIndex(state, seatId)];
      const newBet = seat.streetCommitted;
      const increment = newBet - previousBet;
      if (increment >= state.lastRaiseSize) {
        state.lastRaiseSize = increment;
        meta.shortAllInMatchedFromBet = null;
      } else {
        meta.shortAllInMatchedFromBet = previousBet;
      }
      state.currentBet = newBet;
      meta.lastAggressorSeatId = seatId;
      break;
    }
    case 'raise': {
      const previousBet = state.currentBet;
      const seat = state.seats[seatIndex(state, seatId)];
      const chipsToAdd = action.amount - seat.streetCommitted;
      commitChips(state, seatId, chipsToAdd);
      const increment = action.amount - previousBet;
      if (increment >= state.lastRaiseSize) {
        state.lastRaiseSize = increment;
        meta.shortAllInMatchedFromBet = null;
      } else {
        meta.shortAllInMatchedFromBet = previousBet;
      }
      state.currentBet = action.amount;
      meta.lastAggressorSeatId = seatId;
      break;
    }
    default:
      break;
  }
}

function closeOrContinueBetting(state: HandState): void {
  const meta = getHandMeta(state);
  const stillIn = stillInSeats(state);

  if (stillIn.length === 1) {
    state.phase = 'fold_to_one';
    state.currentSeatId = null;
    return;
  }

  if (!isBettingComplete(state, meta)) {
    state.currentSeatId = nextActorSeatId(state, meta, state.currentSeatId);
    return;
  }

  if (state.street === 'river') {
    state.phase = 'showdown_ready';
    state.currentSeatId = null;
    return;
  }

  state.phase = 'street_complete';
  state.currentSeatId = null;
}

export function applyAction(
  state: HandState,
  seatId: string,
  action: Action,
  options: RulesOptions = {},
): Result<HandState> {
  const legal = legalize(state, seatId, action, options);
  if (!legal.ok) {
    return legal as Result<HandState>;
  }

  const next = cloneHandState(state);
  applyLegalized(next, seatId, legal.value);
  closeOrContinueBetting(next);
  return ok(next);
}

export function needsAutoRunOut(state: HandState): boolean {
  if (state.phase !== 'street_complete' && state.phase !== 'showdown_ready') {
    return false;
  }
  return seatsWithChipsRemaining(state.seats) < 2;
}

export function canOpenNextBettingRound(state: HandState): boolean {
  return (
    state.phase === 'street_complete' &&
    state.street !== 'river' &&
    seatsWithChipsRemaining(state.seats) >= 2
  );
}
