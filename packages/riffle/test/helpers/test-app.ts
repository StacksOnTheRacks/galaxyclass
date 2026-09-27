import { createApp, type AppStores } from '../../src/server/app.js';
import type { VerifyPlayBearer, WsHub } from '../../src/ws/index.js';
import type { HandRouteDeps } from '../../src/server/hands/routes.js';
import type { SubmitActionDeps } from '../../src/server/actions/submit.js';
import type { LabRouteDeps } from '../../src/server/lab/routes.js';
import type { MatchRouteDeps } from '../../src/server/matches/routes.js';
import type { SeatRouteDeps } from '../../src/server/seats/routes.js';
import type { TableRouteDeps } from '../../src/server/table/routes.js';
import { resetEnvCache } from '../../src/server/env.js';
import {
  TEST_FRAME_ANCESTORS,
  TEST_HOST_API_KEY,
  TEST_PUBLIC_ORIGIN,
} from './fixtures.js';

export interface TestAppOptions {
  stores?: Partial<AppStores>;
  wsHub?: WsHub;
  verifyPlayBearer?: VerifyPlayBearer;
  matchDeps?: MatchRouteDeps;
  seatDeps?: SeatRouteDeps;
  handDeps?: HandRouteDeps;
  tableDeps?: TableRouteDeps;
  actionDeps?: SubmitActionDeps;
  labDeps?: LabRouteDeps;
  labEnabled?: boolean;
}

export function createTestApp(options: TestAppOptions = {}) {
  resetEnvCache();
  return createApp({
    env: {
      hostApiKey: TEST_HOST_API_KEY,
      publicOrigin: TEST_PUBLIC_ORIGIN,
      listenPort: 3000,
      frameAncestors: TEST_FRAME_ANCESTORS,
      labEnabled: options.labEnabled ?? false,
    },
    stores: options.stores,
    wsHub: options.wsHub,
    verifyPlayBearer: options.verifyPlayBearer,
    matchDeps: options.matchDeps,
    seatDeps: options.seatDeps,
    handDeps: options.handDeps,
    tableDeps: options.tableDeps,
    actionDeps: options.actionDeps,
    labDeps: options.labDeps,
  });
}

export function authHeaders(apiKey: string = TEST_HOST_API_KEY): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}
