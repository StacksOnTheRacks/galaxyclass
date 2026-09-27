import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeededRng } from '../src/rules/rng.js';
import * as seatGate from '../src/server/seats/capability/gate.js';
import { SEAT_CAPABILITY_HEADER } from '../src/server/table/routes.js';
import {
  resetTurnurSession,
  TurnurAuthenticationError,
} from '../src/server/turnur/session.js';
import {
  createFakeSeatStore,
  createFakeTurnurClientWithSeats,
  seedFakeSeats,
} from './helpers/fake-turnur-seats.js';
import { TEST_HOST_API_KEY, TEST_MATCH_ID, TEST_PLAYER_SUBJECT } from './helpers/fixtures.js';
import { authHeaders, createTestApp } from './helpers/test-app.js';
import { TEST_TURNUR_SDK_KEY } from './helpers/turnur-fixtures.js';

const SEAT_S0 = 's0';
const SEAT_S1 = 's1';

const HOLE_DENYLIST = [
  'hole',
  'holes',
  'holeCards',
  'view',
  'hiddenView',
  'board',
  'pot',
  'blinds',
  'street',
  'HandState',
];

function dealBody(
  overrides: Partial<{
    matchId: string;
    seats: Array<{ seatId: string; stack: number }>;
    buttonSeatId: string;
    blinds: { smallBlind: number; bigBlind: number };
  }> = {},
) {
  return JSON.stringify({
    matchId: TEST_MATCH_ID,
    seats: [
      { seatId: SEAT_S0, stack: 10000 },
      { seatId: SEAT_S1, stack: 10000 },
    ],
    buttonSeatId: SEAT_S0,
    blinds: { smallBlind: 50, bigBlind: 100 },
    ...overrides,
  });
}

function seatCapabilityHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = {};
  if (token !== undefined) {
    headers[SEAT_CAPABILITY_HEADER] = token;
  }
  return headers;
}

async function mintCapability(
  app: ReturnType<typeof createTestApp>['app'],
  seatId: string,
) {
  const response = await app.request('/v1/seats/capability/mint', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      matchId: TEST_MATCH_ID,
      seatId,
      playerSubject: TEST_PLAYER_SUBJECT,
    }),
  });
  const body = await response.json();
  return body.token as string;
}

function setupDealFixture() {
  const store = createFakeSeatStore();
  seedFakeSeats(store, TEST_MATCH_ID, [SEAT_S0, SEAT_S1]);
  const fakeClient = createFakeTurnurClientWithSeats(store);
  const getClient = vi.fn(async () => fakeClient);
  const rng = createSeededRng(42);
  const { app, stores } = createTestApp({
    seatDeps: { getClient },
    handDeps: { getClient, rng },
    tableDeps: { getClient },
  });
  return { app, stores, store, fakeClient, getClient, rng };
}

describe('POST /v1/hands/deal and hidden views', () => {
  beforeEach(() => {
    resetTurnurSession();
    delete process.env.TURNUR_BASE_URL;
    delete process.env.TURNUR_SDK_KEY;
  });

  afterEach(() => {
    resetTurnurSession();
    delete process.env.TURNUR_BASE_URL;
    delete process.env.TURNUR_SDK_KEY;
    vi.restoreAllMocks();
  });

  it('deals holes to Turnur views with host auth and ack-only JSON', async () => {
    const { app, store } = setupDealFixture();
    const requireSeatCapabilitySpy = vi.spyOn(seatGate, 'requireSeatCapability');

    const response = await app.request('/v1/hands/deal', {
      method: 'POST',
      headers: authHeaders(),
      body: dealBody(),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ matchId: TEST_MATCH_ID, seatIds: [SEAT_S0, SEAT_S1] });
    for (const key of HOLE_DENYLIST) {
      expect(body[key]).toBeUndefined();
    }

    expect(store.viewPutCalls).toBe(3);
    expect(store.seatCreateCalls).toBe(1);
    expect(store.turnSetCalls).toBe(0);
    expect(store.moveCreateCalls).toBe(0);
    expect(requireSeatCapabilitySpy).not.toHaveBeenCalled();

    for (const put of store.viewPutBodies) {
      if ('hole' in (put.view as object)) {
        expect(put.view).toEqual(
          expect.objectContaining({
            hole: expect.arrayContaining([expect.any(String), expect.any(String)]),
          }),
        );
      } else {
        expect((put.view as { kind?: string }).kind).toBe('dealer_shoe');
      }
    }
  });

  it('maps the same seed to the same hole cards per seat', async () => {
    const storeA = createFakeSeatStore();
    seedFakeSeats(storeA, TEST_MATCH_ID, [SEAT_S0, SEAT_S1]);
    const clientA = createFakeTurnurClientWithSeats(storeA);
    const getClientA = vi.fn(async () => clientA);
    const appA = createTestApp({
      handDeps: { getClient: getClientA, rng: createSeededRng(99) },
    }).app;

    await appA.request('/v1/hands/deal', {
      method: 'POST',
      headers: authHeaders(),
      body: dealBody(),
    });

    const storeB = createFakeSeatStore();
    seedFakeSeats(storeB, TEST_MATCH_ID, [SEAT_S0, SEAT_S1]);
    const clientB = createFakeTurnurClientWithSeats(storeB);
    const getClientB = vi.fn(async () => clientB);
    const appB = createTestApp({
      handDeps: { getClient: getClientB, rng: createSeededRng(99) },
    }).app;

    await appB.request('/v1/hands/deal', {
      method: 'POST',
      headers: authHeaders(),
      body: dealBody(),
    });

    expect(storeA.viewPutBodies.filter((body) => 'hole' in (body.view as object))).toEqual(
      storeB.viewPutBodies.filter((body) => 'hole' in (body.view as object)),
    );
  });

  it('rejects unauthenticated host deal without view.put', async () => {
    const { app, store } = setupDealFixture();

    const response = await app.request('/v1/hands/deal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: dealBody(),
    });

    expect(response.status).toBe(401);
    expect(store.viewPutCalls).toBe(0);
  });

  it('rejects wrong host secret without view.put', async () => {
    const { app, store } = setupDealFixture();

    const response = await app.request('/v1/hands/deal', {
      method: 'POST',
      headers: authHeaders('wrong-secret'),
      body: dealBody(),
    });

    expect(response.status).toBe(401);
    expect(store.viewPutCalls).toBe(0);
  });

  it('refuses deal when Turnur is not game-authenticated', async () => {
    const store = createFakeSeatStore();
    seedFakeSeats(store, TEST_MATCH_ID, [SEAT_S0, SEAT_S1]);
    const fakeClient = createFakeTurnurClientWithSeats(store);
    const getClient = vi.fn(async () => {
      throw new TurnurAuthenticationError('missing_key');
    });
    const { app } = createTestApp({ handDeps: { getClient, rng: createSeededRng(1) } });

    const response = await app.request('/v1/hands/deal', {
      method: 'POST',
      headers: authHeaders(),
      body: dealBody(),
    });

    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe('turnur_unauthenticated');
    expect(store.viewPutCalls).toBe(0);
    expect(fakeClient.match.view.put).not.toHaveBeenCalled();
  });

  it('refuses deal for unknown seatId on roster', async () => {
    const { app, store } = setupDealFixture();

    const response = await app.request('/v1/hands/deal', {
      method: 'POST',
      headers: authHeaders(),
      body: dealBody({
        seats: [
          { seatId: SEAT_S0, stack: 10000 },
          { seatId: 'missing-seat', stack: 10000 },
        ],
      }),
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('unknown_seat_id');
    expect(store.viewPutCalls).toBe(0);
  });

  it('refuses library-invalid deals without writing views', async () => {
    const { app, store } = setupDealFixture();

    const oneSeat = await app.request('/v1/hands/deal', {
      method: 'POST',
      headers: authHeaders(),
      body: dealBody({ seats: [{ seatId: SEAT_S0, stack: 10000 }] }),
    });
    expect(oneSeat.status).toBe(400);
    expect(store.viewPutCalls).toBe(0);

    const shortStack = await app.request('/v1/hands/deal', {
      method: 'POST',
      headers: authHeaders(),
      body: dealBody({
        seats: [
          { seatId: SEAT_S0, stack: 100 },
          { seatId: SEAT_S1, stack: 10000 },
        ],
      }),
    });
    expect(shortStack.status).toBe(400);
    expect(store.viewPutCalls).toBe(0);
  });

  it('returns null view before deal for a seated seat', async () => {
    const { app } = setupDealFixture();
    const token = await mintCapability(app, SEAT_S0);

    const response = await app.request(
      `/v1/seats/${SEAT_S0}/view?matchId=${encodeURIComponent(TEST_MATCH_ID)}`,
      { headers: seatCapabilityHeaders(token) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ seatId: SEAT_S0, view: null });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns only the gated seat holes after deal', async () => {
    const { app, store } = setupDealFixture();

    await app.request('/v1/hands/deal', {
      method: 'POST',
      headers: authHeaders(),
      body: dealBody(),
    });

    const tokenS0 = await mintCapability(app, SEAT_S0);
    const viewS0 = await app.request(
      `/v1/seats/${SEAT_S0}/view?matchId=${encodeURIComponent(TEST_MATCH_ID)}`,
      { headers: seatCapabilityHeaders(tokenS0) },
    );
    expect(viewS0.status).toBe(200);
    const bodyS0 = await viewS0.json();
    expect(bodyS0.seatId).toBe(SEAT_S0);
    expect(bodyS0.view.hole).toHaveLength(2);

    const tokenS1 = await mintCapability(app, SEAT_S1);
    const tableS1 = await app.request(
      `/v1/seats/${SEAT_S1}/table?matchId=${encodeURIComponent(TEST_MATCH_ID)}`,
      { headers: seatCapabilityHeaders(tokenS1) },
    );
    expect(tableS1.status).toBe(200);
    const tableBody = await tableS1.json();
    expect(tableBody.hole).toHaveLength(2);
    expect(tableBody.seats).toEqual([{ seatId: SEAT_S0 }, { seatId: SEAT_S1 }]);
    for (const key of HOLE_DENYLIST.filter((k) => k !== 'hole')) {
      expect(tableBody[key]).toBeUndefined();
    }
    expect(tableS1.headers.get('Cache-Control')).toBe('no-store');

    const s0Holes = store.viewPutBodies.find((p) => p.seatId === SEAT_S0)?.view as {
      hole: string[];
    };
    expect(bodyS0.view.hole).toEqual(s0Holes.hole);
  });

  it('rejects cross-seat capability reads without view.get for wrong seat', async () => {
    const { app, store } = setupDealFixture();

    await app.request('/v1/hands/deal', {
      method: 'POST',
      headers: authHeaders(),
      body: dealBody(),
    });

    const viewGetBefore = store.viewGetCalls;
    const tokenS0 = await mintCapability(app, SEAT_S0);

    const response = await app.request(
      `/v1/seats/${SEAT_S1}/view?matchId=${encodeURIComponent(TEST_MATCH_ID)}`,
      { headers: seatCapabilityHeaders(tokenS0) },
    );

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('wrong_seat');
    expect(store.viewGetCalls).toBe(viewGetBefore);
  });

  it('fail-closes reads without X-Riffle-Seat-Capability', async () => {
    const { app, store } = setupDealFixture();

    await app.request('/v1/hands/deal', {
      method: 'POST',
      headers: authHeaders(),
      body: dealBody(),
    });

    const viewGetBefore = store.viewGetCalls;

    const missing = await app.request(
      `/v1/seats/${SEAT_S0}/view?matchId=${encodeURIComponent(TEST_MATCH_ID)}`,
    );
    expect(missing.status).toBe(403);
    expect((await missing.json()).error).toBe('missing_capability');

    const cookieOnly = await app.request(
      `/v1/seats/${SEAT_S0}/view?matchId=${encodeURIComponent(TEST_MATCH_ID)}`,
      { headers: { Cookie: 'riffle_play=fake-session' } },
    );
    expect(cookieOnly.status).toBe(403);

    expect(store.viewGetCalls).toBe(viewGetBefore);
  });

  it('returns roster-only public table without view.get', async () => {
    const { app, store } = setupDealFixture();

    await app.request('/v1/hands/deal', {
      method: 'POST',
      headers: authHeaders(),
      body: dealBody(),
    });

    const viewGetBefore = store.viewGetCalls;
    const response = await app.request(
      `/v1/table?matchId=${encodeURIComponent(TEST_MATCH_ID)}`,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      matchId: TEST_MATCH_ID,
      seats: [{ seatId: SEAT_S0 }, { seatId: SEAT_S1 }],
      currentSeat: null,
    });
    for (const key of HOLE_DENYLIST) {
      expect(body[key]).toBeUndefined();
    }
    expect(store.viewGetCalls).toBe(viewGetBefore);
  });

  it('keeps bootstrap and seat routes working without deal regression', async () => {
    const { app } = setupDealFixture();

    const mint = await app.request('/v1/bootstrap/mint', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ matchId: TEST_MATCH_ID }),
    });
    expect(mint.status).toBe(200);

    const list = await app.request('/v1/seats/list', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ matchId: TEST_MATCH_ID }),
    });
    expect(list.status).toBe(200);
  });
});

describe('no hole card logging on deal and read paths', () => {
  it('does not log hole cards or view payloads', async () => {
    const logs: string[] = [];
    const infoSpy = vi.spyOn(console, 'info').mockImplementation((...args) => {
      logs.push(args.map(String).join(' '));
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
      logs.push(args.map(String).join(' '));
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      logs.push(args.map(String).join(' '));
    });

    const { app } = setupDealFixture();

    await app.request('/v1/hands/deal', {
      method: 'POST',
      headers: authHeaders(),
      body: dealBody(),
    });

    const token = await mintCapability(app, SEAT_S0);
    await app.request(
      `/v1/seats/${SEAT_S0}/view?matchId=${encodeURIComponent(TEST_MATCH_ID)}`,
      { headers: seatCapabilityHeaders(token) },
    );

    await app.request('/v1/hands/deal', {
      method: 'POST',
      headers: authHeaders('wrong'),
      body: dealBody(),
    });

    const combined = logs.join('\n');
    expect(combined).not.toMatch(/[AKQJT98765432][shdc]/);
    expect(combined).not.toContain(TEST_HOST_API_KEY);
    expect(combined).not.toContain(TEST_TURNUR_SDK_KEY);
    expect(combined).not.toContain(token);

    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
