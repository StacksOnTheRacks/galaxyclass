import { Hono } from 'hono';
import type { IdentityStore } from '../../identity/store.js';
import type { MatchStore } from '../../match-store/index.js';
import type { RiffleEnv } from '../env.js';
import { parseIdentityBearer } from '../identity/bearer.js';
import { validateMatchId, validateSeatId } from '../seats/validate.js';
import { playViewError } from './errors.js';
import { projectSeatTable, projectSeatViewResponse } from './project.js';

export interface PlayViewRouteDeps {
  identityStore?: IdentityStore;
  matchStore: MatchStore;
}

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function createPlayViewRoutes(env: RiffleEnv, deps: PlayViewRouteDeps) {
  const routes = new Hono();

  routes.get('/matches/:matchId/seats/:seatId/view', (c) => {
    if (!deps.identityStore) {
      return c.json(playViewError('unauthorized'), 401, NO_STORE);
    }

    const bearer = parseIdentityBearer(c.req.header('Authorization'), env);
    if (!bearer) {
      return c.json(playViewError('unauthorized'), 401, NO_STORE);
    }

    const session = deps.identityStore.getSession(bearer);
    if (!session) {
      return c.json(playViewError('unauthorized'), 401, NO_STORE);
    }

    const matchId = validateMatchId(c.req.param('matchId'));
    if (!matchId) {
      return c.json(playViewError('match_not_found'), 404, NO_STORE);
    }

    const seatId = validateSeatId(c.req.param('seatId'));
    if (!seatId) {
      return c.json(playViewError('seat_not_found'), 404, NO_STORE);
    }

    const publicState = deps.matchStore.getPublicState(matchId);
    if (!publicState.ok) {
      return c.json(playViewError('match_not_found'), 404, NO_STORE);
    }

    const seat = publicState.value.seats.find((entry) => entry.seatId === seatId);
    if (!seat) {
      return c.json(playViewError('seat_not_found'), 404, NO_STORE);
    }

    if (seat.playerSubject === null || seat.playerSubject !== session.playerSubject) {
      return c.json(playViewError('not_occupant'), 403, NO_STORE);
    }

    const seatView = deps.matchStore.getSeatView(matchId, seatId);
    if (!seatView.ok) {
      if (seatView.error === 'seat_not_found') {
        return c.json(playViewError('seat_not_found'), 404, NO_STORE);
      }
      return c.json(playViewError('match_not_found'), 404, NO_STORE);
    }

    return c.json(projectSeatViewResponse(seatId, seatView.value), 200, NO_STORE);
  });

  routes.get('/matches/:matchId/seats/:seatId/table', (c) => {
    if (!deps.identityStore) {
      return c.json(playViewError('unauthorized'), 401, NO_STORE);
    }

    const bearer = parseIdentityBearer(c.req.header('Authorization'), env);
    if (!bearer) {
      return c.json(playViewError('unauthorized'), 401, NO_STORE);
    }

    const session = deps.identityStore.getSession(bearer);
    if (!session) {
      return c.json(playViewError('unauthorized'), 401, NO_STORE);
    }

    const matchId = validateMatchId(c.req.param('matchId'));
    if (!matchId) {
      return c.json(playViewError('match_not_found'), 404, NO_STORE);
    }

    const seatId = validateSeatId(c.req.param('seatId'));
    if (!seatId) {
      return c.json(playViewError('seat_not_found'), 404, NO_STORE);
    }

    const publicState = deps.matchStore.getPublicState(matchId);
    if (!publicState.ok) {
      return c.json(playViewError('match_not_found'), 404, NO_STORE);
    }

    const seat = publicState.value.seats.find((entry) => entry.seatId === seatId);
    if (!seat) {
      return c.json(playViewError('seat_not_found'), 404, NO_STORE);
    }

    if (seat.playerSubject === null || seat.playerSubject !== session.playerSubject) {
      return c.json(playViewError('not_occupant'), 403, NO_STORE);
    }

    const seatView = deps.matchStore.getSeatView(matchId, seatId);
    if (!seatView.ok) {
      if (seatView.error === 'seat_not_found') {
        return c.json(playViewError('seat_not_found'), 404, NO_STORE);
      }
      return c.json(playViewError('match_not_found'), 404, NO_STORE);
    }

    return c.json(projectSeatTable(deps.matchStore, matchId, seatView.value), 200, NO_STORE);
  });

  return routes;
}
