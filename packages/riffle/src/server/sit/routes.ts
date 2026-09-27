import { Hono } from 'hono';
import { hasClientSuppliedStateKeys } from '../../match-store/errors.js';
import type { IdentityStore } from '../../identity/store.js';
import type { MatchStore } from '../../match-store/index.js';
import type { RiffleEnv } from '../env.js';
import { parseIdentityBearer } from '../identity/bearer.js';
import { sitError } from './errors.js';

export interface SitRouteDeps {
  identityStore: IdentityStore;
  matchStore: MatchStore;
}

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function projectSitResponse(
  matchStore: MatchStore,
  matchId: string,
  seatId: string,
) {
  const state = matchStore.getPublicState(matchId);
  if (!state.ok) {
    return state;
  }
  return {
    ok: true as const,
    value: {
      matchId: state.value.matchId,
      seatId,
      seats: state.value.seats,
      currentSeat: state.value.currentSeat,
      ...(state.value.pot !== undefined ? { pot: state.value.pot } : {}),
      ...(state.value.board !== undefined ? { board: state.value.board } : {}),
      ...(state.value.completeReason !== undefined
        ? { completeReason: state.value.completeReason }
        : {}),
      ...(state.value.winners !== undefined ? { winners: state.value.winners } : {}),
      ...(state.value.shownHoles !== undefined
        ? { shownHoles: state.value.shownHoles }
        : {}),
    },
  };
}

async function parseSitBody(
  raw: unknown,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: 'invalid_body' | 'client_supplied_state' }> {
  if (raw === undefined || raw === null) {
    return { ok: true, body: {} };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'invalid_body' };
  }

  const body = raw as Record<string, unknown>;
  if ('seatId' in body) {
    return { ok: false, error: 'invalid_body' };
  }
  if ('playerSubject' in body) {
    return { ok: false, error: 'client_supplied_state' };
  }
  if (hasClientSuppliedStateKeys(body)) {
    return { ok: false, error: 'client_supplied_state' };
  }

  return { ok: true, body };
}

export function createSitRoutes(env: RiffleEnv, deps: SitRouteDeps) {
  const routes = new Hono();

  routes.get('/matches/:matchId/table', (c) => {
    const matchId = c.req.param('matchId')?.trim() ?? '';
    if (!matchId) {
      return c.json(sitError('match_not_found'), 404, NO_STORE);
    }

    const result = deps.matchStore.getPublicState(matchId);
    if (!result.ok) {
      return c.json(sitError('match_not_found'), 404, NO_STORE);
    }

    return c.json(result.value, 200, NO_STORE);
  });

  routes.post('/matches/:matchId/sit', async (c) => {
    const bearer = parseIdentityBearer(c.req.header('Authorization'), env);
    if (!bearer) {
      return c.json(sitError('unauthorized'), 401, NO_STORE);
    }

    const session = deps.identityStore.getSession(bearer);
    if (!session) {
      return c.json(sitError('unauthorized'), 401, NO_STORE);
    }

    const matchId = c.req.param('matchId')?.trim() ?? '';
    if (!matchId) {
      return c.json(sitError('match_not_found'), 404, NO_STORE);
    }

    let rawBody: unknown = {};
    try {
      const text = await c.req.text();
      if (text.trim().length > 0) {
        rawBody = JSON.parse(text);
      }
    } catch {
      rawBody = {};
    }

    const parsedBody = await parseSitBody(rawBody);
    if (!parsedBody.ok) {
      return c.json(sitError(parsedBody.error), 400, NO_STORE);
    }

    const claim = deps.matchStore.claimEmptySeat(matchId, session.playerSubject);
    if (!claim.ok) {
      if (claim.error === 'match_not_found') {
        return c.json(sitError('match_not_found'), 404, NO_STORE);
      }
      if (claim.error === 'seat_occupied') {
        return c.json(sitError('seat_occupied'), 409, NO_STORE);
      }
      if (claim.error === 'illegal_turn') {
        return c.json(sitError('illegal_turn'), 409, NO_STORE);
      }
      return c.json(sitError('seat_occupied'), 409, NO_STORE);
    }

    const projected = projectSitResponse(deps.matchStore, matchId, claim.value.seatId);
    if (!projected.ok) {
      return c.json(sitError('match_not_found'), 404, NO_STORE);
    }

    const status = claim.value.created ? 201 : 200;
    return c.json(projected.value, status, NO_STORE);
  });

  return routes;
}
