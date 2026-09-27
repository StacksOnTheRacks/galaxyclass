import { Hono } from 'hono';
import type { RiffleEnv } from '../env.js';
import { requireHostAuth, unauthorizedResponse } from '../host-auth.js';
import { createSeat, type CreateSeatDeps } from './create.js';
import { mapSeatTurnurError } from './errors.js';
import { listSeats, type ListSeatsDeps } from './list.js';
import { validateMatchId } from './validate.js';

export type SeatRouteDeps = CreateSeatDeps & ListSeatsDeps;

export function createSeatRoutes(_env: RiffleEnv, deps: SeatRouteDeps = {}) {
  const routes = new Hono();

  routes.post('/', async (c) => {
    if (!requireHostAuth(c, _env)) {
      return unauthorizedResponse();
    }

    let body: { matchId?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return Response.json({ error: 'invalid_match_id' }, { status: 400 });
    }

    const matchId = validateMatchId(body.matchId);
    if (!matchId) {
      return Response.json({ error: 'invalid_match_id' }, { status: 400 });
    }

    try {
      const result = await createSeat({ matchId }, deps);
      return Response.json(
        { seatId: result.seatId, currentSeat: result.currentSeat },
        { status: 201 },
      );
    } catch (error) {
      return mapSeatTurnurError(error);
    }
  });

  routes.post('/list', async (c) => {
    if (!requireHostAuth(c, _env)) {
      return unauthorizedResponse();
    }

    let body: { matchId?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return Response.json({ error: 'invalid_match_id' }, { status: 400 });
    }

    const matchId = validateMatchId(body.matchId);
    if (!matchId) {
      return Response.json({ error: 'invalid_match_id' }, { status: 400 });
    }

    try {
      const result = await listSeats({ matchId }, deps);
      return Response.json(result, { status: 200 });
    } catch (error) {
      return mapSeatTurnurError(error);
    }
  });

  return routes;
}
