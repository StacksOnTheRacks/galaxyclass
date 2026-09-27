import { Hono } from 'hono';
import { parsePlaySessionCookie } from '../bootstrap/cookie.js';
import type { PlaySessionStore } from '../bootstrap/play-session.js';
import type { RiffleEnv } from '../env.js';
import {
  requireSeatCapability,
  SeatCapabilityError,
} from '../seats/capability/gate.js';
import type { SeatCapabilityLedger } from '../seats/capability/ledger.js';
import { validateMatchId, validateSeatId } from '../seats/validate.js';
import { TurnurAuthenticationError } from '../turnur/session.js';
import type { TurnurClient } from '@turnur/sdk';
import { requireAuthenticatedTurnurClient } from '../turnur/session.js';
import {
  mapTableTurnurError,
  seatCapabilityErrorResponse,
  turnurUnauthenticatedResponse,
} from './errors.js';
import { getPublicTable } from './public.js';
import { getSeatTable, InvalidViewError, ShoeSeatNotFoundError } from './seat.js';
import { getSeatView } from './view.js';

export const SEAT_CAPABILITY_HEADER = 'X-Riffle-Seat-Capability';

export interface TableStores {
  seatCapabilityLedger: SeatCapabilityLedger;
  playSessionStore: PlaySessionStore;
}

export interface TableRouteDeps {
  getClient?: () => Promise<TurnurClient>;
  requireSeatCapabilityFn?: typeof requireSeatCapability;
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

export function createTableRoutes(
  _env: RiffleEnv,
  stores: TableStores,
  deps: TableRouteDeps = {},
) {
  const routes = new Hono();
  const getClient = deps.getClient ?? requireAuthenticatedTurnurClient;
  const gate = deps.requireSeatCapabilityFn ?? requireSeatCapability;

  routes.get('/table', async (c) => {
    const matchId = validateMatchId(c.req.query('matchId'));
    if (!matchId) {
      return Response.json({ error: 'invalid_match_id' }, { status: 400 });
    }

    const attachedMatchId = resolveAttachedMatchId(
      c.req.header('Cookie'),
      stores.playSessionStore,
    );
    if (attachedMatchId !== undefined && attachedMatchId !== matchId) {
      return Response.json({ error: 'wrong_match' }, { status: 403 });
    }

    try {
      const table = await getPublicTable({ matchId }, { getClient });
      return Response.json(table, { status: 200 });
    } catch (error) {
      if (error instanceof TurnurAuthenticationError) {
        return turnurUnauthenticatedResponse(error.reason);
      }
      return mapTableTurnurError(error);
    }
  });

  routes.get('/seats/:seatId/view', async (c) => {
    const matchId = validateMatchId(c.req.query('matchId'));
    if (!matchId) {
      return Response.json({ error: 'invalid_match_id' }, { status: 400 });
    }

    const seatId = validateSeatId(c.req.param('seatId'));
    if (!seatId) {
      return Response.json({ error: 'invalid_seat_id' }, { status: 400 });
    }

    try {
      gate({
        matchId,
        seatId,
        token: c.req.header(SEAT_CAPABILITY_HEADER),
        attachedMatchId: resolveAttachedMatchId(
          c.req.header('Cookie'),
          stores.playSessionStore,
        ),
        ledger: stores.seatCapabilityLedger,
      });
    } catch (error) {
      if (error instanceof SeatCapabilityError) {
        return seatCapabilityErrorResponse(error.code);
      }
      throw error;
    }

    try {
      const view = await getSeatView({ matchId, seatId }, { getClient });
      return noStoreJson(view, 200);
    } catch (error) {
      if (error instanceof InvalidViewError) {
        return Response.json({ error: 'invalid_view' }, { status: 502 });
      }
      if (error instanceof TurnurAuthenticationError) {
        return turnurUnauthenticatedResponse(error.reason);
      }
      return mapTableTurnurError(error, 'seat');
    }
  });

  routes.get('/seats/:seatId/table', async (c) => {
    const matchId = validateMatchId(c.req.query('matchId'));
    if (!matchId) {
      return Response.json({ error: 'invalid_match_id' }, { status: 400 });
    }

    const seatId = validateSeatId(c.req.param('seatId'));
    if (!seatId) {
      return Response.json({ error: 'invalid_seat_id' }, { status: 400 });
    }

    try {
      gate({
        matchId,
        seatId,
        token: c.req.header(SEAT_CAPABILITY_HEADER),
        attachedMatchId: resolveAttachedMatchId(
          c.req.header('Cookie'),
          stores.playSessionStore,
        ),
        ledger: stores.seatCapabilityLedger,
      });
    } catch (error) {
      if (error instanceof SeatCapabilityError) {
        return seatCapabilityErrorResponse(error.code);
      }
      throw error;
    }

    try {
      const table = await getSeatTable({ matchId, seatId }, { getClient });
      return noStoreJson(table, 200);
    } catch (error) {
      if (error instanceof ShoeSeatNotFoundError) {
        return Response.json({ error: 'seat_not_found' }, { status: 404 });
      }
      if (error instanceof InvalidViewError) {
        return Response.json({ error: 'invalid_view' }, { status: 502 });
      }
      if (error instanceof TurnurAuthenticationError) {
        return turnurUnauthenticatedResponse(error.reason);
      }
      return mapTableTurnurError(error, 'seat');
    }
  });

  return routes;
}
