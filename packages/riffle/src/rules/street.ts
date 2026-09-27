import { err, ok } from './errors.js';
import {
  cloneHandState,
  firstToActPostflop,
  getHandMeta,
} from './state.js';
import type { Card, HandState, Result } from './types.js';

function drawFromDeck(state: HandState, count: number): Card[] {
  const drawn = state.deckRemaining.slice(0, count);
  state.deckRemaining = state.deckRemaining.slice(count);
  return drawn;
}

export function runOutRemainingStreets(state: HandState): Result<HandState> {
  if (state.phase === 'complete') {
    return err('already_complete', 'hand is already complete');
  }

  const next = cloneHandState(state);

  while (next.board.length < 5) {
    const burn = drawFromDeck(next, 1);
    next.burns.push(...burn);

    if (next.street === 'preflop') {
      next.board.push(...drawFromDeck(next, 3));
      next.street = 'flop';
    } else if (next.street === 'flop') {
      next.board.push(...drawFromDeck(next, 1));
      next.street = 'turn';
    } else if (next.street === 'turn') {
      next.board.push(...drawFromDeck(next, 1));
      next.street = 'river';
    } else {
      return err('cannot_advance', 'cannot run out beyond the river');
    }

    for (const seat of next.seats) {
      seat.streetCommitted = 0;
    }
    next.currentBet = 0;
  }

  next.phase = 'showdown_ready';
  next.currentSeatId = null;
  return ok(next);
}

export function advanceStreet(state: HandState): Result<HandState> {
  if (state.phase === 'complete') {
    return err('already_complete', 'hand is already complete');
  }
  if (state.phase !== 'street_complete') {
    if (state.phase === 'betting') {
      return err('street_not_complete', 'betting is not complete on this street');
    }
    return err('cannot_advance', 'cannot advance street from current phase');
  }

  const next = cloneHandState(state);

  if (next.street === 'river') {
    return err('cannot_advance', 'cannot advance beyond the river');
  }

  const burn = drawFromDeck(next, 1);
  next.burns.push(...burn);

  if (next.street === 'preflop') {
    next.board.push(...drawFromDeck(next, 3));
    next.street = 'flop';
  } else if (next.street === 'flop') {
    next.board.push(...drawFromDeck(next, 1));
    next.street = 'turn';
  } else if (next.street === 'turn') {
    next.board.push(...drawFromDeck(next, 1));
    next.street = 'river';
  } else {
    return err('cannot_advance', 'cannot advance street');
  }

  for (const seat of next.seats) {
    seat.streetCommitted = 0;
  }
  next.currentBet = 0;
  next.lastRaiseSize = next.blinds.bigBlind;
  next.phase = 'betting';

  const meta = getHandMeta(next);
  meta.actedThisStreet.clear();
  meta.lastAggressorSeatId = null;

  next.currentSeatId = firstToActPostflop(next);
  if (!next.currentSeatId) {
    return err('cannot_advance', 'no actor available after street advance');
  }

  return ok(next);
}
