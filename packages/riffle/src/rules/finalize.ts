import { canOpenNextBettingRound, needsAutoRunOut } from './apply.js';
import { completeFoldToOne, showdown } from './complete.js';
import { ok } from './errors.js';
import { advanceStreet, runOutRemainingStreets } from './street.js';
import type { HandState, Result } from './types.js';

export function finalizeTerminalHand(state: HandState): Result<HandState> {
  let current = state;

  for (let guard = 0; guard < 8; guard += 1) {
    if (current.phase === 'fold_to_one') {
      return completeFoldToOne(current);
    }

    if (current.phase === 'showdown_ready') {
      if (current.board.length < 5 && needsAutoRunOut(current)) {
        const run = runOutRemainingStreets(current);
        if (!run.ok) {
          return run;
        }
        current = run.value;
        continue;
      }
      return showdown(current);
    }

    if (canOpenNextBettingRound(current)) {
      const advanced = advanceStreet(current);
      if (!advanced.ok) {
        return advanced;
      }
      current = advanced.value;
      continue;
    }

    if (needsAutoRunOut(current)) {
      const run = runOutRemainingStreets(current);
      if (!run.ok) {
        return run;
      }
      current = run.value;
      continue;
    }

    break;
  }

  return ok(current);
}
