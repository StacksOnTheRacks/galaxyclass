import { Hono } from 'hono';
import type { RiffleEnv } from '../env.js';
import { requireHostAuth, unauthorizedResponse } from '../host-auth.js';
import { validateMatchId, validateSeatId } from '../seats/validate.js';
import { dealHandForMatch, type DealHandDeps } from './deal.js';
import { openBetting, type OpenBettingDeps } from './open.js';

export type HandRouteDeps = DealHandDeps & OpenBettingDeps;

interface DealBody {
  matchId?: unknown;
  seats?: unknown;
  buttonSeatId?: unknown;
  blinds?: unknown;
}

function parseDealBody(body: DealBody):
  | {
      ok: true;
      value: {
        matchId: string;
        seats: { seatId: string; stack: number }[];
        buttonSeatId: string;
        blinds: { smallBlind: number; bigBlind: number };
      };
    }
  | { ok: false; error: string } {
  const matchId = validateMatchId(body.matchId);
  if (!matchId) {
    return { ok: false, error: 'invalid_match_id' };
  }

  if (!Array.isArray(body.seats)) {
    return { ok: false, error: 'invalid_deal' };
  }

  const seats: { seatId: string; stack: number }[] = [];
  const seen = new Set<string>();

  for (const entry of body.seats) {
    if (typeof entry !== 'object' || entry === null) {
      return { ok: false, error: 'invalid_seat_id' };
    }
    const seatId = validateSeatId((entry as { seatId?: unknown }).seatId);
    if (!seatId) {
      return { ok: false, error: 'invalid_seat_id' };
    }
    if (seen.has(seatId)) {
      return { ok: false, error: 'invalid_deal' };
    }
    seen.add(seatId);
    const stack = (entry as { stack?: unknown }).stack;
    if (typeof stack !== 'number' || !Number.isInteger(stack)) {
      return { ok: false, error: 'invalid_deal' };
    }
    seats.push({ seatId, stack });
  }

  if (seats.length < 2 || seats.length > 9) {
    return { ok: false, error: 'invalid_deal' };
  }

  const buttonSeatId = validateSeatId(body.buttonSeatId);
  if (!buttonSeatId) {
    return { ok: false, error: 'invalid_deal' };
  }

  if (typeof body.blinds !== 'object' || body.blinds === null) {
    return { ok: false, error: 'invalid_deal' };
  }
  const blindsObj = body.blinds as { smallBlind?: unknown; bigBlind?: unknown };
  if (
    typeof blindsObj.smallBlind !== 'number' ||
    typeof blindsObj.bigBlind !== 'number' ||
    !Number.isInteger(blindsObj.smallBlind) ||
    !Number.isInteger(blindsObj.bigBlind)
  ) {
    return { ok: false, error: 'invalid_deal' };
  }

  return {
    ok: true,
    value: {
      matchId,
      seats,
      buttonSeatId,
      blinds: {
        smallBlind: blindsObj.smallBlind,
        bigBlind: blindsObj.bigBlind,
      },
    },
  };
}

export function createHandRoutes(_env: RiffleEnv, deps: HandRouteDeps = {}) {
  const routes = new Hono();

  routes.post('/deal', async (c) => {
    if (!requireHostAuth(c, _env)) {
      return unauthorizedResponse();
    }

    let body: DealBody;
    try {
      body = await c.req.json();
    } catch {
      return Response.json({ error: 'invalid_match_id' }, { status: 400 });
    }

    const parsed = parseDealBody(body);
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }

    const result = await dealHandForMatch(parsed.value, deps);
    if (!result.ok) {
      switch (result.error.kind) {
        case 'turnur_unauthenticated':
          return Response.json(
            { error: 'turnur_unauthenticated', reason: result.error.reason },
            { status: 503 },
          );
        case 'turnur':
          return result.error.response;
        case 'unknown_seat_id':
          return Response.json({ error: 'unknown_seat_id' }, { status: 400 });
        case 'all_in_or_side_pot_unsupported':
          return Response.json(
            { error: 'all_in_or_side_pot_unsupported' },
            { status: 400 },
          );
        case 'invalid_deal':
          return Response.json({ error: 'invalid_deal' }, { status: 400 });
        case 'shoe_ambiguous':
          return result.error.response;
      }
    }

    return Response.json(result.value, { status: 201 });
  });

  routes.post('/betting/open', async (c) => {
    if (!requireHostAuth(c, _env)) {
      return unauthorizedResponse();
    }

    let body: DealBody;
    try {
      body = await c.req.json();
    } catch {
      return Response.json({ error: 'invalid_match_id' }, { status: 400 });
    }

    const parsed = parseDealBody(body);
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }

    const result = await openBetting(parsed.value, deps);
    if (!result.ok) {
      switch (result.error.kind) {
        case 'turnur_unauthenticated':
          return Response.json(
            { error: 'turnur_unauthenticated', reason: result.error.reason },
            { status: 503 },
          );
        case 'turnur':
          return result.error.response;
        case 'unknown_seat_id':
          return Response.json({ error: 'unknown_seat_id' }, { status: 400 });
        case 'invalid_deal':
          return Response.json({ error: 'invalid_deal' }, { status: 400 });
        case 'holes_not_dealt':
          return Response.json({ error: 'holes_not_dealt' }, { status: 400 });
        case 'invalid_view':
          return result.error.response;
        case 'betting_already_open':
          return result.error.response;
        case 'illegal_turn':
          return result.error.response;
        case 'shoe_missing':
          return result.error.response;
        case 'shoe_ambiguous':
          return result.error.response;
      }
    }

    return Response.json(result.value, { status: 201 });
  });

  return routes;
}
