import { Hono } from 'hono';
import { hasClientSuppliedStateKeys } from '../../match-store/errors.js';
import type { IdentityStore } from '../../identity/store.js';
import type { MatchStore } from '../../match-store/index.js';
import type { RiffleEnv } from '../env.js';
import { parseIdentityBearer } from '../identity/bearer.js';
import { displayNameError } from './errors.js';
import { normalizeDisplayName } from './validate.js';

export interface DisplayNameRouteDeps {
  identityStore: IdentityStore;
  matchStore: MatchStore;
}

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function projectDisplayNameResponse(
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

async function parseDisplayNameBody(
  raw: unknown,
): Promise<
  | { ok: true; displayName: unknown }
  | { ok: false; error: 'invalid_body' | 'client_supplied_state' }
> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'invalid_body' };
  }

  const body = raw as Record<string, unknown>;

  if ('seatId' in body || 'playerSubject' in body) {
    return { ok: false, error: 'invalid_body' };
  }

  if (hasClientSuppliedStateKeys(body)) {
    return { ok: false, error: 'client_supplied_state' };
  }

  if (!('displayName' in body) || Object.keys(body).length !== 1) {
    return { ok: false, error: 'invalid_body' };
  }

  return { ok: true, displayName: body.displayName };
}

export function createDisplayNameRoutes(env: RiffleEnv, deps: DisplayNameRouteDeps) {
  const routes = new Hono();

  routes.post('/matches/:matchId/display-name', async (c) => {
    const bearer = parseIdentityBearer(c.req.header('Authorization'), env);
    if (!bearer) {
      return c.json(displayNameError('unauthorized'), 401, NO_STORE);
    }

    const session = deps.identityStore.getSession(bearer);
    if (!session) {
      return c.json(displayNameError('unauthorized'), 401, NO_STORE);
    }

    const matchId = c.req.param('matchId')?.trim() ?? '';
    if (!matchId) {
      return c.json(displayNameError('match_not_found'), 404, NO_STORE);
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json(displayNameError('invalid_body'), 400, NO_STORE);
    }

    const parsedBody = await parseDisplayNameBody(rawBody);
    if (!parsedBody.ok) {
      return c.json(displayNameError(parsedBody.error), 400, NO_STORE);
    }

    const normalized = normalizeDisplayName(parsedBody.displayName);
    if (!normalized.ok) {
      return c.json(displayNameError('invalid_display_name'), 400, NO_STORE);
    }

    const seatLookup = deps.matchStore.findSeatForPlayer(matchId, session.playerSubject);
    if (!seatLookup.ok) {
      if (seatLookup.error === 'match_not_found') {
        return c.json(displayNameError('match_not_found'), 404, NO_STORE);
      }
      if (seatLookup.error === 'not_seated') {
        return c.json(displayNameError('not_seated'), 403, NO_STORE);
      }
      if (seatLookup.error === 'illegal_turn') {
        return c.json(displayNameError('illegal_turn'), 409, NO_STORE);
      }
      return c.json(displayNameError('not_seated'), 403, NO_STORE);
    }

    const write = deps.matchStore.setSeatDisplayName(
      matchId,
      seatLookup.value.seatId,
      normalized.value,
    );
    if (!write.ok) {
      if (write.error === 'match_not_found') {
        return c.json(displayNameError('match_not_found'), 404, NO_STORE);
      }
      if (write.error === 'seat_not_found') {
        return c.json(displayNameError('not_seated'), 403, NO_STORE);
      }
      if (write.error === 'illegal_turn') {
        return c.json(displayNameError('illegal_turn'), 409, NO_STORE);
      }
      return c.json(displayNameError('illegal_turn'), 409, NO_STORE);
    }

    const projected = projectDisplayNameResponse(
      deps.matchStore,
      matchId,
      seatLookup.value.seatId,
    );
    if (!projected.ok) {
      return c.json(displayNameError('match_not_found'), 404, NO_STORE);
    }

    return c.json(projected.value, 200, NO_STORE);
  });

  return routes;
}
