import { err, ok } from './errors.js';
import { cloneHandState, stillInSeats } from './state.js';
import {
  applyAwards,
  mergeWinnersBySeat,
  settlePots,
} from './pots.js';
import type { HandState, Result } from './types.js';

export function completeFoldToOne(state: HandState): Result<HandState> {
  if (state.phase === 'complete') {
    return err('already_complete', 'hand is already complete');
  }
  if (state.phase !== 'fold_to_one') {
    return err('not_fold_to_one', 'hand is not fold-to-one');
  }

  const stillIn = stillInSeats(state);
  if (stillIn.length !== 1) {
    return err('not_fold_to_one', 'exactly one seat must remain');
  }

  const next = cloneHandState(state);
  const { pots, winners } = settlePots(next);
  applyAwards(next, winners);
  next.pots = pots;
  next.phase = 'complete';
  next.completeReason = 'fold_to_one';
  next.currentSeatId = null;
  next.winners = mergeWinnersBySeat(winners);

  return ok(next);
}

export function showdown(state: HandState): Result<HandState> {
  if (state.phase === 'complete') {
    return err('already_complete', 'hand is already complete');
  }
  if (state.phase !== 'showdown_ready') {
    return err('not_showdown', 'hand is not ready for showdown');
  }
  if (state.street !== 'river' || state.board.length !== 5) {
    return err('not_showdown', 'showdown requires a complete river board');
  }

  const stillIn = stillInSeats(state);
  if (stillIn.length < 2) {
    return err('not_showdown', 'showdown requires at least two seats');
  }

  const next = cloneHandState(state);
  const { pots, winners } = settlePots(next);
  applyAwards(next, winners);
  next.pots = pots;
  next.phase = 'complete';
  next.completeReason = 'showdown';
  next.currentSeatId = null;
  next.winners = mergeWinnersBySeat(winners);

  return ok(next);
}
