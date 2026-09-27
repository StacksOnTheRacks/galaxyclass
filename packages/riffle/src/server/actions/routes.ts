import { Hono } from 'hono';
import { parsePlaySessionCookie } from '../bootstrap/cookie.js';
import type { PlaySessionStore } from '../bootstrap/play-session.js';
import type { RiffleEnv } from '../env.js';
import type { SeatCapabilityLedger } from '../seats/capability/ledger.js';
import { validateMatchId, validateSeatId } from '../seats/validate.js';
import {
  seatCapabilityErrorResponse,
  turnurUnauthenticatedResponse,
} from '../table/errors.js';
import { SEAT_CAPABILITY_HEADER } from '../table/routes.js';
import { submitAction, type SubmitActionDeps } from './submit.js';

export interface ActionRouteStores {
  seatCapabilityLedger: SeatCapabilityLedger;
  playSessionStore: PlaySessionStore;
}

function resolveAttachedMatchId(
  cookieHeader: string | undefined,
  playSessionStore: PlaySessionStore,
): string | undefined {
  const sessionId = parsePlaySessionCookie(cookieHeader);
  if (!sessionId) {
    return undefined;
  }
  return playSessionStore.get(sessionId)?.matchId;
}

function noStoreJson(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function createActionRoutes(
  _env: RiffleEnv,
  stores: ActionRouteStores,
  deps: SubmitActionDeps = {},
) {
  const routes = new Hono();

  routes.post('/:seatId/actions', async (c) => {
    let body: { matchId?: unknown; action?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return Response.json({ error: 'invalid_match_id' }, { status: 400 });
    }

    const parsedMatchId = validateMatchId(body.matchId);
    if (!parsedMatchId) {
      return Response.json({ error: 'invalid_match_id' }, { status: 400 });
    }

    const seatId = validateSeatId(c.req.param('seatId'));
    if (!seatId) {
      return Response.json({ error: 'invalid_seat_id' }, { status: 400 });
    }

    const result = await submitAction(
      {
        matchId: parsedMatchId,
        seatId,
        action: body.action,
        capabilityToken: c.req.header(SEAT_CAPABILITY_HEADER),
        attachedMatchId: resolveAttachedMatchId(
          c.req.header('Cookie'),
          stores.playSessionStore,
        ),
        ledger: stores.seatCapabilityLedger,
      },
      deps,
    );

    if (!result.ok) {
      switch (result.error.kind) {
        case 'capability':
          return seatCapabilityErrorResponse(result.error.code);
        case 'turnur_unauthenticated':
          return turnurUnauthenticatedResponse(result.error.reason);
        case 'turnur':
        case 'betting_not_open':
        case 'invalid_view':
        case 'reconstruct_failed':
        case 'off_turn':
        case 'illegal_action':
        case 'all_in_or_side_pot_unsupported':
        case 'already_complete':
        case 'illegal_turn':
        case 'hand_not_ready':
        case 'complete_failed':
        case 'street_not_complete':
        case 'cannot_advance':
        case 'advance_failed':
          return result.error.response;
        case 'holes_not_dealt':
          return Response.json({ error: 'holes_not_dealt' }, { status: 400 });
      }
    }

    return noStoreJson(result.value, 200);
  });

  return routes;
}
