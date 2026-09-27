import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeededRng } from '../src/rules/rng.js';
import * as dealModule from '../src/server/hands/deal.js';
import * as openModule from '../src/server/hands/open.js';
import { parseLabEnabled } from '../src/server/env.js';
import {
  createFakeSeatStore,
  createFakeTurnurClientWithSeats,
  seedFakeSeats,
} from './helpers/fake-turnur-seats.js';
import {
  TEST_HOST_API_KEY,
  TEST_MATCH_ID,
} from './helpers/fixtures.js';
import { authHeaders, createTestApp } from './helpers/test-app.js';
import {
  TEST_TURNUR_BASE_URL,
  TEST_TURNUR_SDK_KEY,
} from './helpers/turnur-fixtures.js';

const LAB_SESSION_PATH = '/v1/lab/session';
const LAB_DEAL_PATH = '/v1/lab/deal';

const HOLE_DENYLIST = [
  'hole',
  'holes',
  'holeCards',
  'view',
  'hiddenView',
  'board',
  'HandState',
];

function loopbackLabApp(
  options: {
    remoteAddress?: string | undefined;
    labEnabled?: boolean;
  } = {},
) {
  const store = createFakeSeatStore();
  const fakeClient = createFakeTurnurClientWithSeats(store);
  const getClient = vi.fn(async () => fakeClient);
  const rng = createSeededRng(42);
  const remoteAddress =
    options.remoteAddress === undefined && 'remoteAddress' in options
      ? undefined
      : (options.remoteAddress ?? '127.0.0.1');

  const { app, stores } = createTestApp({
    labEnabled: options.labEnabled ?? true,
    matchDeps: { getClient },
    seatDeps: { getClient },
    handDeps: { getClient, rng },
    tableDeps: { getClient },
    labDeps: {
      getClient,
      rng,
      getRemoteAddress: () => remoteAddress,
    },
  });

  return { app, stores, store, fakeClient, getClient, rng };
}

async function postLabSession(app: ReturnType<typeof createTestApp>['app']) {
  return app.request(LAB_SESSION_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
}

async function postLabDeal(
  app: ReturnType<typeof createTestApp>['app'],
  matchId: string,
  options: {
    headers?: HeadersInit;
    body?: string;
  } = {},
) {
  return app.request(LAB_DEAL_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body ?? JSON.stringify({ matchId }),
  });
}

describe('POST /v1/lab/deal', () => {
  beforeEach(() => {
    vi.spyOn(dealModule, 'dealHandForMatch');
    vi.spyOn(openModule, 'openBetting');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deals and opens betting after lab session with fixed HU defaults', async () => {
    const { app, store } = loopbackLabApp();

    const sessionResponse = await postLabSession(app);
    expect(sessionResponse.status).toBe(201);
    const sessionBody = await sessionResponse.json();
    const [seat0, seat1] = sessionBody.seats;

    const dealResponse = await postLabDeal(app, sessionBody.matchId);
    expect(dealResponse.status).toBe(201);
    const dealBody = await dealResponse.json();
    expect(dealBody).toEqual({
      matchId: sessionBody.matchId,
      currentSeat: seat0.seatId,
    });
    expect(dealBody.currentSeat).toBeTruthy();

    expect(dealModule.dealHandForMatch).toHaveBeenCalledTimes(1);
    expect(openModule.openBetting).toHaveBeenCalledTimes(1);
    expect(dealModule.dealHandForMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        matchId: sessionBody.matchId,
        seats: [
          { seatId: seat0.seatId, stack: 10000 },
          { seatId: seat1.seatId, stack: 10000 },
        ],
        buttonSeatId: seat0.seatId,
        blinds: { smallBlind: 50, bigBlind: 100 },
      }),
      expect.any(Object),
    );

    expect(
      store.viewPutBodies.filter((entry) =>
        [seat0.seatId, seat1.seatId].includes(entry.seatId),
      ),
    ).toHaveLength(2);
    expect(store.turnSetCalls).toBe(1);
    expect(store.moveCreateCalls).toBe(1);
    const handOpenPayload = store.moveCreateBodies[0]?.payload as Record<string, unknown>;
    expect(handOpenPayload.kind).toBe('hand_open');

    const tableResponse = await app.request(`/v1/table?matchId=${sessionBody.matchId}`);
    const tableBody = await tableResponse.json();
    expect(tableBody.pot).toBe(150);
    expect(tableBody.currentSeat).toBe(seat0.seatId);
    expect(tableBody.seats).toEqual(
      expect.arrayContaining([
        { seatId: seat0.seatId, stack: 9950 },
        { seatId: seat1.seatId, stack: 9900 },
      ]),
    );

    const serialized = JSON.stringify(dealBody);
    for (const key of HOLE_DENYLIST) {
      expect(serialized).not.toContain(`"${key}"`);
    }
    expect(serialized).not.toContain(TEST_HOST_API_KEY);
    expect(serialized).not.toContain(TEST_TURNUR_SDK_KEY);
    expect(serialized).not.toContain(TEST_TURNUR_BASE_URL);
    expect(dealResponse.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('deals when session registry is seeded directly', async () => {
    const { app, stores, store } = loopbackLabApp();
    const seatA = 'seat-a';
    const seatB = 'seat-b';
    seedFakeSeats(store, TEST_MATCH_ID, [seatA, seatB]);
    stores.labSessionStore.register({
      matchId: TEST_MATCH_ID,
      seatIds: [seatA, seatB],
    });

    const dealResponse = await postLabDeal(app, TEST_MATCH_ID);
    expect(dealResponse.status).toBe(201);
    expect(dealModule.dealHandForMatch).toHaveBeenCalledTimes(1);
    expect(openModule.openBetting).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown matchId with zero deal/open calls', async () => {
    const { app } = loopbackLabApp();

    const response = await postLabDeal(app, TEST_MATCH_ID);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'lab_session_unknown' });
    expect(dealModule.dealHandForMatch).not.toHaveBeenCalled();
    expect(openModule.openBetting).not.toHaveBeenCalled();
  });

  it('rejects invalid matchId with zero deal/open calls', async () => {
    const { app } = loopbackLabApp();

    const response = await postLabDeal(app, ' ', { body: JSON.stringify({ matchId: ' ' }) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_match_id' });
    expect(dealModule.dealHandForMatch).not.toHaveBeenCalled();
    expect(openModule.openBetting).not.toHaveBeenCalled();
  });

  it('rejects second deal on same matchId', async () => {
    const { app } = loopbackLabApp();
    const sessionResponse = await postLabSession(app);
    const sessionBody = await sessionResponse.json();

    const first = await postLabDeal(app, sessionBody.matchId);
    expect(first.status).toBe(201);

    const second = await postLabDeal(app, sessionBody.matchId);
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: 'betting_already_open' });
    expect(dealModule.dealHandForMatch).toHaveBeenCalledTimes(1);
    expect(openModule.openBetting).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['flag omitted', { labEnabled: false }],
    ['flag false string', { labEnabled: parseLabEnabled('false') }],
    ['flag yes string', { labEnabled: parseLabEnabled('yes') }],
  ])('rejects when %s even with host Bearer and performs zero deal/open', async (_label, envOverride) => {
    const store = createFakeSeatStore();
    const fakeClient = createFakeTurnurClientWithSeats(store);
    const getClient = vi.fn(async () => fakeClient);
    const rng = createSeededRng(42);

    const { app, stores } = createTestApp({
      ...envOverride,
      matchDeps: { getClient },
      seatDeps: { getClient },
      handDeps: { getClient, rng },
      labDeps: {
        getClient,
        rng,
        getRemoteAddress: () => '127.0.0.1',
      },
    });
    stores.labSessionStore.register({
      matchId: TEST_MATCH_ID,
      seatIds: ['s0', 's1'],
    });

    const response = await postLabDeal(app, TEST_MATCH_ID, { headers: authHeaders() });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'lab_disabled' });
    expect(dealModule.dealHandForMatch).not.toHaveBeenCalled();
    expect(openModule.openBetting).not.toHaveBeenCalled();
  });

  it.each([
    ['public IPv4', '8.8.8.8'],
    ['RFC1918', '10.0.0.5'],
    ['missing address', undefined],
  ])('rejects non-loopback client (%s) with zero deal/open', async (_label, remoteAddress) => {
    const { app, stores } = loopbackLabApp({ remoteAddress: remoteAddress as string | undefined });
    stores.labSessionStore.register({
      matchId: TEST_MATCH_ID,
      seatIds: ['s0', 's1'],
    });

    const response = await postLabDeal(app, TEST_MATCH_ID);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'lab_forbidden' });
    expect(dealModule.dealHandForMatch).not.toHaveBeenCalled();
    expect(openModule.openBetting).not.toHaveBeenCalled();
  });

  it('does not trust X-Forwarded-For when injected remote address is non-loopback', async () => {
    const { app, stores } = loopbackLabApp({ remoteAddress: '8.8.8.8' });
    stores.labSessionStore.register({
      matchId: TEST_MATCH_ID,
      seatIds: ['s0', 's1'],
    });

    const response = await postLabDeal(app, TEST_MATCH_ID, {
      headers: {
        'X-Forwarded-For': '127.0.0.1',
      },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'lab_forbidden' });
    expect(dealModule.dealHandForMatch).not.toHaveBeenCalled();
    expect(openModule.openBetting).not.toHaveBeenCalled();
  });

  it('rejects non-JSON Content-Type with zero deal/open', async () => {
    const { app, stores } = loopbackLabApp();
    stores.labSessionStore.register({
      matchId: TEST_MATCH_ID,
      seatIds: ['s0', 's1'],
    });

    const response = await app.request(LAB_DEAL_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify({ matchId: TEST_MATCH_ID }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_content_type' });
    expect(dealModule.dealHandForMatch).not.toHaveBeenCalled();
    expect(openModule.openBetting).not.toHaveBeenCalled();
  });
});
