import type { TurnurClient } from '@turnur/sdk';
import { advanceStreet } from '../../rules/index.js';
import type { HandState } from '../../rules/types.js';
import { buildStreetDealPayload } from './move-types.js';

export interface AdvanceStreetDeps {
  advanceStreetFn?: typeof advanceStreet;
}

export type AdvanceStreetError =
  | { kind: 'street_not_complete'; response: Response }
  | { kind: 'cannot_advance'; response: Response }
  | { kind: 'all_in_or_side_pot_unsupported'; response: Response }
  | { kind: 'advance_failed'; response: Response }
  | { kind: 'illegal_turn'; response: Response }
  | { kind: 'turnur'; response: Response };

function mapAdvanceReject(code: string): AdvanceStreetError {
  switch (code) {
    case 'street_not_complete':
      return {
        kind: 'street_not_complete',
        response: Response.json({ error: 'street_not_complete' }, { status: 409 }),
      };
    case 'cannot_advance':
      return {
        kind: 'cannot_advance',
        response: Response.json({ error: 'cannot_advance' }, { status: 409 }),
      };
    case 'all_in_or_side_pot_unsupported':
      return {
        kind: 'all_in_or_side_pot_unsupported',
        response: Response.json({ error: 'all_in_or_side_pot_unsupported' }, { status: 400 }),
      };
    default:
      return {
        kind: 'advance_failed',
        response: Response.json({ error: 'advance_failed' }, { status: 502 }),
      };
  }
}

function isTurnur409(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string; status?: number }).name === 'TurnurApiError' &&
    (error as { status?: number }).status === 409
  );
}

export async function maybeAdvanceStreet(input: {
  matchId: string;
  pathSeatId: string;
  state: HandState;
  client: TurnurClient;
  deps?: AdvanceStreetDeps;
}): Promise<
  | { ok: true; value: HandState }
  | { ok: false; error: AdvanceStreetError }
> {
  const advanceStreetFn = input.deps?.advanceStreetFn ?? advanceStreet;
  const { state, client, matchId, pathSeatId } = input;

  if (state.phase !== 'street_complete') {
    return { ok: false, error: mapAdvanceReject('street_not_complete') };
  }

  if (
    state.street === 'river'
  ) {
    return { ok: false, error: mapAdvanceReject('cannot_advance') };
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

  const advanced = advanceStreetFn(state);
  if (!advanced.ok) {
    return { ok: false, error: mapAdvanceReject(advanced.error.code) };
  }

  if (advanced.value.currentSeatId === null) {
    return {
      ok: false,
      error: {
        kind: 'advance_failed',
        response: Response.json({ error: 'advance_failed' }, { status: 502 }),
      },
    };
  }

  const streetDealPayload = buildStreetDealPayload(
    advanced.value.street as 'flop' | 'turn' | 'river',
    advanced.value.board,
  );

  try {
    await client.match.move.create(matchId, {
      seatId: pathSeatId,
      payload: streetDealPayload,
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

  try {
    await client.match.turn.set(matchId, advanced.value.currentSeatId);
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

  return { ok: true, value: advanced.value };
}
