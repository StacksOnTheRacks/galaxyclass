import { Hono } from 'hono';
import type { RiffleEnv } from '../env.js';
import { requireHostAuth, unauthorizedResponse } from '../host-auth.js';
import { mapSeatTurnurError } from '../seats/errors.js';
import { createMatch, type CreateMatchDeps } from './create.js';

export type MatchRouteDeps = CreateMatchDeps;

export function createMatchRoutes(_env: RiffleEnv, deps: MatchRouteDeps = {}) {
  const routes = new Hono();

  routes.post('/', async (c) => {
    if (!requireHostAuth(c, _env)) {
      return unauthorizedResponse();
    }

    try {
      const result = await createMatch(deps);
      return Response.json({ matchId: result.matchId }, { status: 201 });
    } catch (error) {
      return mapSeatTurnurError(error);
    }
  });

  return routes;
}
