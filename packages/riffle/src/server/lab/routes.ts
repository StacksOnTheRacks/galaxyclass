import { Hono } from 'hono';
import type { BootstrapStores } from '../bootstrap/routes.js';
import type { RiffleEnv } from '../env.js';
import type { DealHandDeps } from '../hands/deal.js';
import type { OpenBettingDeps } from '../hands/open.js';
import type { CreateMatchDeps } from '../matches/create.js';
import type { CreateSeatDeps } from '../seats/create.js';
import type { SeatCapabilityStores } from '../seats/capability/routes.js';
import { dealLabHandOrError, parseLabDealMatchId } from './deal.js';
import { enforceLabGate } from './gate.js';
import type { GetRemoteAddress } from './remote-address.js';
import { startLabSessionOrError } from './session.js';
import type { LabSessionStore } from './session-store.js';

export interface LabRouteDeps extends CreateMatchDeps, CreateSeatDeps, DealHandDeps, OpenBettingDeps {
  getRemoteAddress?: GetRemoteAddress;
}

export type LabRouteStores = Pick<BootstrapStores, 'bootstrapLedger'> &
  Pick<SeatCapabilityStores, 'seatCapabilityLedger'> & {
    labSessionStore: LabSessionStore;
  };

export function createLabRoutes(
  env: RiffleEnv,
  stores: LabRouteStores,
  deps: LabRouteDeps = {},
) {
  const routes = new Hono();

  routes.post('/session', async (c) => {
    const gate = enforceLabGate(c, env, deps.getRemoteAddress);
    if (gate) {
      return gate;
    }

    try {
      await c.req.json();
    } catch {
      return Response.json({ error: 'invalid_content_type' }, { status: 400 });
    }

    const result = await startLabSessionOrError(env, stores, deps);
    if (result instanceof Response) {
      return result;
    }

    stores.labSessionStore.register({
      matchId: result.matchId,
      seatIds: [result.seats[0].seatId, result.seats[1].seatId],
    });

    return Response.json(result, { status: 201 });
  });

  routes.post('/deal', async (c) => {
    const gate = enforceLabGate(c, env, deps.getRemoteAddress);
    if (gate) {
      return gate;
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return Response.json({ error: 'invalid_content_type' }, { status: 400 });
    }

    const matchId = parseLabDealMatchId(body);
    if (!matchId) {
      return Response.json({ error: 'invalid_match_id' }, { status: 400 });
    }

    const result = await dealLabHandOrError(matchId, stores.labSessionStore, deps);
    if (result instanceof Response) {
      return result;
    }

    return Response.json(result, { status: 201 });
  });

  routes.get('/session', () => {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  });

  return routes;
}
