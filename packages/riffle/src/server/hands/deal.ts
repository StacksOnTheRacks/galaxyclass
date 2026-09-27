import type { TurnurClient } from '@turnur/sdk';
import { dealHand } from '../../rules/deal.js';
import type { DealConfig, Rng } from '../../rules/types.js';
import {
  requireAuthenticatedTurnurClient,
  TurnurAuthenticationError,
} from '../turnur/session.js';
import { mapTableTurnurError } from '../table/errors.js';
import { createCryptoRng } from './rng.js';
import { buildShoeView, putShoe, resolveShoeSeatIdFromExtras } from './shoe.js';

export interface DealHandInput {
  matchId: string;
  seats: { seatId: string; stack: number }[];
  buttonSeatId: string;
  blinds: { smallBlind: number; bigBlind: number };
}

export interface DealHandResult {
  matchId: string;
  seatIds: string[];
}

export interface DealHandDeps {
  getClient?: () => Promise<TurnurClient>;
  dealHandFn?: typeof dealHand;
  rng?: Rng;
}

export type DealHandError =
  | { kind: 'turnur_unauthenticated'; reason: string }
  | { kind: 'turnur'; response: Response }
  | { kind: 'unknown_seat_id' }
  | { kind: 'invalid_deal' }
  | { kind: 'all_in_or_side_pot_unsupported' }
  | { kind: 'shoe_ambiguous'; response: Response };

export async function dealHandForMatch(
  input: DealHandInput,
  deps: DealHandDeps = {},
): Promise<{ ok: true; value: DealHandResult } | { ok: false; error: DealHandError }> {
  const getClient = deps.getClient ?? requireAuthenticatedTurnurClient;
  const dealHandFn = deps.dealHandFn ?? dealHand;
  const rng = deps.rng ?? createCryptoRng();

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

  const dealConfig: DealConfig = {
    seats: input.seats,
    buttonSeatId: input.buttonSeatId,
    blinds: input.blinds,
    rng,
  };

  const dealt = dealHandFn(dealConfig);
  if (!dealt.ok) {
    if (dealt.error.code === 'all_in_or_side_pot_unsupported') {
      return { ok: false, error: { kind: 'all_in_or_side_pot_unsupported' } };
    }
    return { ok: false, error: { kind: 'invalid_deal' } };
  }

  for (const seat of dealt.value.seats) {
    try {
      await client.match.view.put(input.matchId, seat.seatId, { hole: seat.hole });
    } catch (error) {
      return {
        ok: false,
        error: { kind: 'turnur', response: mapTableTurnurError(error, 'seat') },
      };
    }
  }

  const playerSeatIds = input.seats.map((seat) => seat.seatId);
  const rosterSeatIds = roster.seats.map((seat) => seat.seatId);
  const shoeResolve = resolveShoeSeatIdFromExtras(rosterSeatIds, playerSeatIds);

  let shoeSeatId: string;
  if (shoeResolve.ok) {
    shoeSeatId = shoeResolve.shoeSeatId;
  } else if (shoeResolve.error === 'shoe_missing') {
    try {
      const created = await client.match.seat.create(input.matchId);
      shoeSeatId = created.seatId;
    } catch (error) {
      return {
        ok: false,
        error: { kind: 'turnur', response: mapTableTurnurError(error, 'seat') },
      };
    }
  } else {
    return {
      ok: false,
      error: {
        kind: 'shoe_ambiguous',
        response: Response.json({ error: 'shoe_ambiguous' }, { status: 502 }),
      },
    };
  }

  try {
    await putShoe(
      client,
      input.matchId,
      shoeSeatId,
      buildShoeView(dealt.value.deckRemaining, dealt.value.burns),
    );
  } catch (error) {
    return {
      ok: false,
      error: { kind: 'turnur', response: mapTableTurnurError(error, 'seat') },
    };
  }

  return {
    ok: true,
    value: {
      matchId: input.matchId,
      seatIds: input.seats.map((seat) => seat.seatId),
    },
  };
}
