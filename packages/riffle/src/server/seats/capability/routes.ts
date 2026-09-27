import { Hono } from 'hono';
import type { PlaySessionStore } from '../../bootstrap/play-session.js';
import { parsePlaySessionCookie } from '../../bootstrap/cookie.js';
import type { RiffleEnv } from '../../env.js';
import { requireHostAuth, unauthorizedResponse } from '../../host-auth.js';
import { SeatCapabilityError } from './gate.js';
import { requireSeatCapability } from './gate.js';
import { SeatCapabilityLedger } from './ledger.js';
import { mintSeatCapability } from './mint.js';

export interface SeatCapabilityStores {
  seatCapabilityLedger: SeatCapabilityLedger;
  playSessionStore: PlaySessionStore;
}

export function createSeatCapabilityStores(
  playSessionStore: PlaySessionStore,
): SeatCapabilityStores {
  return {
    seatCapabilityLedger: new SeatCapabilityLedger(),
    playSessionStore,
  };
}

function seatCapabilityErrorResponse(code: SeatCapabilityError['code']) {
  return Response.json({ error: code }, { status: 403 });
}

function validateMatchId(value: unknown): string | undefined {
  const matchId = typeof value === 'string' ? value.trim() : '';
  if (!matchId || matchId.length > 128) {
    return undefined;
  }
  return matchId;
}

function validateSeatId(value: unknown): string | undefined {
  const seatId = typeof value === 'string' ? value.trim() : '';
  if (!seatId || seatId.length > 128) {
    return undefined;
  }
  return seatId;
}

function validatePlayerSubject(value: unknown): string | undefined {
  const playerSubject = typeof value === 'string' ? value.trim() : '';
  if (!playerSubject || playerSubject.length > 256) {
    return undefined;
  }
  return playerSubject;
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

export function createSeatCapabilityRoutes(env: RiffleEnv, stores: SeatCapabilityStores) {
  const routes = new Hono();

  routes.post('/mint', async (c) => {
    if (!requireHostAuth(c, env)) {
      return unauthorizedResponse();
    }

    let body: { matchId?: unknown; seatId?: unknown; playerSubject?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return Response.json({ error: 'invalid_match_id' }, { status: 400 });
    }

    const matchId = validateMatchId(body.matchId);
    if (!matchId) {
      return Response.json({ error: 'invalid_match_id' }, { status: 400 });
    }

    const seatId = validateSeatId(body.seatId);
    if (!seatId) {
      return Response.json({ error: 'invalid_seat_id' }, { status: 400 });
    }

    const playerSubject = validatePlayerSubject(body.playerSubject);
    if (!playerSubject) {
      return Response.json({ error: 'invalid_player_subject' }, { status: 400 });
    }

    const minted = mintSeatCapability(stores.seatCapabilityLedger, {
      matchId,
      seatId,
      playerSubject,
    });

    return Response.json({
      token: minted.token,
      expiresIn: minted.expiresIn,
      jti: minted.jti,
    });
  });

  routes.post('/probe', async (c) => {
    let body: { matchId?: unknown; seatId?: unknown; type?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return seatCapabilityErrorResponse('missing_capability');
    }

    const matchId = validateMatchId(body.matchId);
    const seatId = validateSeatId(body.seatId);
    if (!matchId || !seatId) {
      return seatCapabilityErrorResponse('missing_capability');
    }

    const token = c.req.header('X-Riffle-Seat-Capability');
    const attachedMatchId = resolveAttachedMatchId(
      c.req.header('Cookie'),
      stores.playSessionStore,
    );

    try {
      const verified = requireSeatCapability({
        matchId,
        seatId,
        token,
        attachedMatchId,
        ledger: stores.seatCapabilityLedger,
      });

      return Response.json({ ok: true, jti: verified.jti });
    } catch (error) {
      if (error instanceof SeatCapabilityError) {
        return seatCapabilityErrorResponse(error.code);
      }
      throw error;
    }
  });

  return routes;
}
