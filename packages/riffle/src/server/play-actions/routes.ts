import { Hono } from 'hono';
import type { IdentityStore } from '../../identity/store.js';
import type { MatchStore } from '../../match-store/index.js';
import type { WsHub } from '../../ws/hub.js';
import type { RiffleEnv } from '../env.js';
import { parseIdentityBearer } from '../identity/bearer.js';
import { validateMatchId, validateSeatId } from '../seats/validate.js';
import { playActionError } from './errors.js';
import { parsePlayActionRequest } from './parse.js';
import { projectPlayActionSeatTable } from './project.js';

export interface PlayActionRouteDeps {
  identityStore: IdentityStore;
  matchStore: MatchStore;
  wsHub?: WsHub;
}

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function createPlayActionRoutes(env: RiffleEnv, deps: PlayActionRouteDeps) {
  const routes = new Hono();

  routes.post('/matches/:matchId/seats/:seatId/actions', async (c) => {
    const bearer = parseIdentityBearer(c.req.header('Authorization'), env);
    if (!bearer) {
      return c.json(playActionError('unauthorized'), 401, NO_STORE);
    }

    const session = deps.identityStore.getSession(bearer);
    if (!session) {
      return c.json(playActionError('unauthorized'), 401, NO_STORE);
    }

    const matchId = validateMatchId(c.req.param('matchId'));
    if (!matchId) {
      return c.json(playActionError('match_not_found'), 404, NO_STORE);
    }

    const seatId = validateSeatId(c.req.param('seatId'));
    if (!seatId) {
      return c.json(playActionError('seat_not_found'), 404, NO_STORE);
    }

    const record = deps.matchStore.getPublicState(matchId);
    if (!record.ok) {
      return c.json(playActionError('match_not_found'), 404, NO_STORE);
    }

    const seat = record.value.seats.find((entry) => entry.seatId === seatId);
    if (!seat) {
      return c.json(playActionError('seat_not_found'), 404, NO_STORE);
    }

    if (seat.playerSubject === null || seat.playerSubject !== session.playerSubject) {
      return c.json(playActionError('not_occupant'), 403, NO_STORE);
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json(playActionError('invalid_body'), 400, NO_STORE);
    }

    const parsed = parsePlayActionRequest(rawBody);
    if (!parsed.ok) {
      return c.json(playActionError(parsed.error), 400, NO_STORE);
    }

    const applied = deps.matchStore.applyPlayerAction(
      matchId,
      seatId,
      parsed.action,
      session.playerSubject,
    );

    if (!applied.ok) {
      return c.json(playActionError(applied.error), applied.status, NO_STORE);
    }

    if (deps.wsHub) {
      try {
        deps.wsHub.notifyPublicTable(matchId);
      } catch {
        // Push is not accept; swallow notify failures.
      }
    }

    return c.json(projectPlayActionSeatTable(matchId, applied.value), 200, NO_STORE);
  });

  return routes;
}
