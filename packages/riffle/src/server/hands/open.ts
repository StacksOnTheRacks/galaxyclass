import type { TurnurClient } from '@turnur/sdk';
import type { Card } from '../../rules/types.js';
import {
  requireAuthenticatedTurnurClient,
  TurnurAuthenticationError,
} from '../turnur/session.js';
import { mapTableTurnurError } from '../table/errors.js';
import { parseHoleView } from '../table/dto.js';
import { buildHandOpenPayload, type MoveLogItem } from './move-types.js';
import { findLatestHandOpen, reconstructHand } from './reconstruct.js';
import { resolveShoeSeatIdFromExtras } from './shoe.js';

export interface OpenBettingInput {
  matchId: string;
  seats: { seatId: string; stack: number }[];
  buttonSeatId: string;
  blinds: { smallBlind: number; bigBlind: number };
}

export interface OpenBettingDeps {
  getClient?: () => Promise<TurnurClient>;
}

export type OpenBettingError =
  | { kind: 'turnur_unauthenticated'; reason: string }
  | { kind: 'turnur'; response: Response }
  | { kind: 'unknown_seat_id' }
  | { kind: 'invalid_deal' }
  | { kind: 'holes_not_dealt' }
  | { kind: 'invalid_view'; response: Response }
  | { kind: 'betting_already_open'; response: Response }
  | { kind: 'illegal_turn'; response: Response }
  | { kind: 'shoe_missing'; response: Response }
  | { kind: 'shoe_ambiguous'; response: Response };

function isTurnur409(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string; status?: number }).name === 'TurnurApiError' &&
    (error as { status?: number }).status === 409
  );
}

async function loadHolesBySeat(
  client: TurnurClient,
  matchId: string,
  seatIds: string[],
): Promise<
  | { ok: true; value: Map<string, [Card, Card]> }
  | { ok: false; error: 'holes_not_dealt' | 'invalid_view'; response?: Response }
> {
  const holesBySeat = new Map<string, [Card, Card]>();

  for (const seatId of seatIds) {
    let viewResult;
    try {
      viewResult = await client.match.view.get(matchId, seatId);
    } catch (error) {
      return { ok: false, error: 'invalid_view', response: mapTableTurnurError(error, 'seat') };
    }

    if (viewResult.view === null || viewResult.view === undefined) {
      return { ok: false, error: 'holes_not_dealt' };
    }

    const parsed = parseHoleView(viewResult.view);
    if (!parsed) {
      return { ok: false, error: 'invalid_view' };
    }
    holesBySeat.set(seatId, parsed.hole);
  }

  return { ok: true, value: holesBySeat };
}

export async function openBetting(
  input: OpenBettingInput,
  deps: OpenBettingDeps = {},
): Promise<
  | { ok: true; value: { matchId: string; currentSeat: string } }
  | { ok: false; error: OpenBettingError }
> {
  const getClient = deps.getClient ?? requireAuthenticatedTurnurClient;

  let client: TurnurClient;
  try {
    client = await getClient();
  } catch (error) {
    if (error instanceof TurnurAuthenticationError) {
      return {
        ok: false,
        error: { kind: 'turnur_unauthenticated', reason: error.reason },
      };
    }
    throw error;
  }

  let roster;
  try {
    roster = await client.match.seat.list(input.matchId);
  } catch (error) {
    return { ok: false, error: { kind: 'turnur', response: mapTableTurnurError(error) } };
  }

  const rosterIds = new Set(roster.seats.map((seat) => seat.seatId));
  for (const seat of input.seats) {
    if (!rosterIds.has(seat.seatId)) {
      return { ok: false, error: { kind: 'unknown_seat_id' } };
    }
  }

  let movesList;
  try {
    movesList = await client.match.moves.list(input.matchId);
  } catch (error) {
    return { ok: false, error: { kind: 'turnur', response: mapTableTurnurError(error) } };
  }

  const items = movesList.items as MoveLogItem[];
  if (findLatestHandOpen(items)) {
    return {
      ok: false,
      error: {
        kind: 'betting_already_open',
        response: Response.json({ error: 'betting_already_open' }, { status: 409 }),
      },
    };
  }

  const holes = await loadHolesBySeat(
    client,
    input.matchId,
    input.seats.map((seat) => seat.seatId),
  );
  if (!holes.ok) {
    if (holes.error === 'holes_not_dealt') {
      return { ok: false, error: { kind: 'holes_not_dealt' } };
    }
    return {
      ok: false,
      error: {
        kind: 'invalid_view',
        response: holes.response ?? Response.json({ error: 'invalid_view' }, { status: 502 }),
      },
    };
  }

  const playerSeatIds = input.seats.map((seat) => seat.seatId);
  const shoeResolve = resolveShoeSeatIdFromExtras(
    roster.seats.map((seat) => seat.seatId),
    playerSeatIds,
  );
  if (!shoeResolve.ok) {
    if (shoeResolve.error === 'shoe_missing') {
      return {
        ok: false,
        error: {
          kind: 'shoe_missing',
          response: Response.json({ error: 'shoe_missing' }, { status: 400 }),
        },
      };
    }
    return {
      ok: false,
      error: {
        kind: 'shoe_ambiguous',
        response: Response.json({ error: 'shoe_ambiguous' }, { status: 502 }),
      },
    };
  }

  const handOpenPayload = buildHandOpenPayload({
    ...input,
    shoeSeatId: shoeResolve.shoeSeatId,
  });
  const reconstructed = reconstructHand({
    handOpen: handOpenPayload,
    actions: [],
    holesBySeat: holes.value,
  });
  if (!reconstructed.ok || reconstructed.value.currentSeatId === null) {
    return { ok: false, error: { kind: 'invalid_deal' } };
  }

  const firstActor = reconstructed.value.currentSeatId;

  try {
    await client.match.turn.set(input.matchId, firstActor);
  } catch (error) {
    if (isTurnur409(error)) {
      return {
        ok: false,
        error: {
          kind: 'illegal_turn',
          response: Response.json({ error: 'illegal_turn' }, { status: 409 }),
        },
      };
    }
    return { ok: false, error: { kind: 'turnur', response: mapTableTurnurError(error) } };
  }

  try {
    await client.match.move.create(input.matchId, {
      seatId: firstActor,
      payload: handOpenPayload,
    });
  } catch (error) {
    if (isTurnur409(error)) {
      return {
        ok: false,
        error: {
          kind: 'illegal_turn',
          response: Response.json({ error: 'illegal_turn' }, { status: 409 }),
        },
      };
    }
    return { ok: false, error: { kind: 'turnur', response: mapTableTurnurError(error) } };
  }

  return {
    ok: true,
    value: { matchId: input.matchId, currentSeat: firstActor },
  };
}
