import type { TurnurClient } from '@turnur/sdk';
import { completeFoldToOne, showdown } from '../../rules/index.js';
import type { HandState } from '../../rules/types.js';
import { stillInSeats } from '../../rules/state.js';
import {
  buildHandCompletePayload,
  findLatestHandComplete,
  type HandCompletePayload,
  type HandCompleteReason,
  type ShownHoleFact,
} from './move-types.js';

export interface CompleteHandDeps {
  completeFoldToOneFn?: typeof completeFoldToOne;
  showdownFn?: typeof showdown;
}

export type CompleteHandError =
  | { kind: 'hand_not_ready'; response: Response }
  | { kind: 'all_in_or_side_pot_unsupported'; response: Response }
  | { kind: 'complete_failed'; response: Response }
  | { kind: 'already_complete'; response: Response }
  | { kind: 'illegal_turn'; response: Response }
  | { kind: 'turnur'; response: Response };

function isTurnur409(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string; status?: number }).name === 'TurnurApiError' &&
    (error as { status?: number }).status === 409
  );
}

function buildShownHolesFromState(state: HandState): ShownHoleFact[] {
  return stillInSeats(state).map((seat) => ({
    seatId: seat.seatId,
    hole: [seat.hole[0], seat.hole[1]],
  }));
}

export async function maybeCompleteHand(input: {
  matchId: string;
  pathSeatId: string;
  state: HandState;
  reason: HandCompleteReason;
  client: TurnurClient;
  deps?: CompleteHandDeps;
}): Promise<
  | { ok: true; value: HandState; shownHoles?: ShownHoleFact[] }
  | { ok: false; error: CompleteHandError }
> {
  const completeFoldToOneFn = input.deps?.completeFoldToOneFn ?? completeFoldToOne;
  const showdownFn = input.deps?.showdownFn ?? showdown;
  const { state, client, matchId, pathSeatId, reason } = input;

  if (state.phase === 'complete') {
    return {
      ok: false,
      error: {
        kind: 'already_complete',
        response: Response.json({ error: 'already_complete' }, { status: 409 }),
      },
    };
  }

  if (state.phase !== 'fold_to_one' && state.phase !== 'showdown_ready') {
    return {
      ok: false,
      error: {
        kind: 'hand_not_ready',
        response: Response.json({ error: 'hand_not_ready' }, { status: 409 }),
      },
    };
  }

  for (const seat of state.seats) {
    if (!seat.folded && seat.stack === 0) {
      return {
        ok: false,
        error: {
          kind: 'all_in_or_side_pot_unsupported',
          response: Response.json({ error: 'all_in_or_side_pot_unsupported' }, { status: 400 }),
        },
      };
    }
  }

  let completed;
  let shownHoles: ShownHoleFact[] | undefined;

  if (reason === 'fold_to_one') {
    if (state.phase !== 'fold_to_one') {
      return {
        ok: false,
        error: {
          kind: 'hand_not_ready',
          response: Response.json({ error: 'hand_not_ready' }, { status: 409 }),
        },
      };
    }
    completed = completeFoldToOneFn(state);
  } else {
    if (state.phase !== 'showdown_ready') {
      return {
        ok: false,
        error: {
          kind: 'hand_not_ready',
          response: Response.json({ error: 'hand_not_ready' }, { status: 409 }),
        },
      };
    }
    shownHoles = buildShownHolesFromState(state);
    completed = showdownFn(state);
  }

  if (!completed.ok) {
    return {
      ok: false,
      error: {
        kind: 'complete_failed',
        response: Response.json({ error: 'complete_failed' }, { status: 502 }),
      },
    };
  }

  const payload = buildHandCompletePayload({
    reason,
    winners: (completed.value.winners ?? []).map((winner) => ({
      seatId: winner.seatId,
      amount: winner.amount,
    })),
    shownHoles: reason === 'showdown' ? shownHoles : undefined,
  });

  try {
    await client.match.move.create(matchId, {
      seatId: pathSeatId,
      payload,
    });
  } catch (error) {
    if (isTurnur409(error)) {
      await client.match.moves.list(matchId);
      await client.match.turn.get(matchId);
      return {
        ok: false,
        error: {
          kind: 'illegal_turn',
          response: Response.json({ error: 'illegal_turn' }, { status: 409 }),
        },
      };
    }
    const { mapTableTurnurError } = await import('../table/errors.js');
    return {
      ok: false,
      error: { kind: 'turnur', response: mapTableTurnurError(error) },
    };
  }

  return {
    ok: true,
    value: completed.value,
    shownHoles: reason === 'showdown' ? shownHoles : undefined,
  };
}

export function projectCompleteFromLog(
  actions: import('./move-types.js').MoveLogItem[],
): {
  completeReason?: HandCompleteReason;
  winners?: import('./move-types.js').HandCompleteWinner[];
  shownHoles?: ShownHoleFact[];
} {
  const latest = findLatestHandComplete(actions);
  if (!latest) {
    return {};
  }
  const result = {
    completeReason: latest.reason,
    winners: latest.winners,
  };
  if (latest.reason === 'showdown' && latest.shownHoles) {
    return { ...result, shownHoles: latest.shownHoles };
  }
  return result;
}