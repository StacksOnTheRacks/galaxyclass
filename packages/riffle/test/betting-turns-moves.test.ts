import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TurnurApiError } from '@turnur/sdk';
import { createSeededRng } from '../src/rules/rng.js';
import * as seatGate from '../src/server/seats/capability/gate.js';
import * as rules from '../src/rules/index.js';
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

const SEAT_S0 = 's0';
const SEAT_S1 = 's1';

const HOLE_DENYLIST = [
  'hole',
  'holes',
  'holeCards',
  'view',
  'hiddenView',
  'board',
  'HandState',
];

function openBody() {
  return JSON.stringify({
    matchId: TEST_MATCH_ID,
    seats: [
      { seatId: SEAT_S0, stack: 10000 },
      { seatId: SEAT_S1, stack: 10000 },
    ],
    buttonSeatId: SEAT_S0,
    blinds: { smallBlind: 50, bigBlind: 100 },
  });
}

function dealBody() {
  return openBody();
}

function seatCapabilityHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
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

function setupBettingFixture() {
  const store = createFakeSeatStore();
  seedFakeSeats(store, TEST_MATCH_ID, [SEAT_S0, SEAT_S1]);
  const fakeClient = createFakeTurnurClientWithSeats(store);
  const getClient = vi.fn(async () => fakeClient);
  const rng = createSeededRng(42);
  const { app, stores } = createTestApp({
    seatDeps: { getClient },
    handDeps: { getClient, rng },
    tableDeps: { getClient },
    actionDeps: { getClient },
  });
  return { app, stores, store, fakeClient, getClient, rng };
}

async function dealAndOpen(app: ReturnType<typeof createTestApp>['app']) {
  await app.request('/v1/hands/deal', {
    method: 'POST',
    headers: authHeaders(),
    body: dealBody(),
  });
  return app.request('/v1/hands/betting/open', {
    method: 'POST',
    headers: authHeaders(),
    body: openBody(),
  });
}

describe('betting open and on-turn actions', () => {
  beforeEach(() => {
    resetTurnurSession();
    delete process.env.TURNUR_BASE_URL;
    delete process.env.TURNUR_SDK_KEY;
  });

  afterEach(() => {
    resetTurnurSession();
    vi.restoreAllMocks();
  });

  it('opens betting with turn.set then hand_open and exposes pot/stacks on public table', async () => {
    const { app, store } = setupBettingFixture();
    const requireSeatCapabilitySpy = vi.spyOn(seatGate, 'requireSeatCapability');

    const beforeOpen = await app.request(`/v1/table?matchId=${TEST_MATCH_ID}`);
    const beforeBody = await beforeOpen.json();
    expect(beforeBody.pot).toBeUndefined();
    expect(beforeBody.seats.every((seat: { stack?: number }) => seat.stack === undefined)).toBe(
      true,
    );

    const openResponse = await dealAndOpen(app);
    expect(openResponse.status).toBe(201);
    expect(await openResponse.json()).toEqual({
      matchId: TEST_MATCH_ID,
      currentSeat: SEAT_S0,
    });

    expect(store.turnSetCalls).toBe(1);
    expect(store.moveCreateCalls).toBe(1);
    expect(requireSeatCapabilitySpy).not.toHaveBeenCalled();

    const handOpenPayload = store.moveCreateBodies[0]?.payload as Record<string, unknown>;
    expect(handOpenPayload.kind).toBe('hand_open');
    for (const key of HOLE_DENYLIST) {
      expect(handOpenPayload[key]).toBeUndefined();
    }

    const tableResponse = await app.request(`/v1/table?matchId=${TEST_MATCH_ID}`);
    const tableBody = await tableResponse.json();
    expect(tableBody.pot).toBe(150);
    expect(tableBody.currentSeat).toBe(SEAT_S0);
    expect(tableBody.seats).toEqual(
      expect.arrayContaining([
        { seatId: SEAT_S0, stack: 9950 },
        { seatId: SEAT_S1, stack: 9900 },
      ]),
    );

    const viewGetsBeforeTable = store.viewGetCalls;
    const tableResponse2 = await app.request(`/v1/table?matchId=${TEST_MATCH_ID}`);
    expect(tableResponse2.status).toBe(200);
    expect(store.viewGetCalls).toBe(viewGetsBeforeTable);
  });

  it('rejects host open without auth and performs zero writes', async () => {
    const { app, store } = setupBettingFixture();
    await app.request('/v1/hands/deal', {
      method: 'POST',
      headers: authHeaders(),
      body: dealBody(),
    });

    const response = await app.request('/v1/hands/betting/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: openBody(),
    });

    expect(response.status).toBe(401);
    expect(store.turnSetCalls).toBe(0);
    expect(store.moveCreateCalls).toBe(0);
  });

  it('accepts a legal raise with capability gate before writes', async () => {
    const { app, store } = setupBettingFixture();
    const legalizeSpy = vi.spyOn(rules, 'legalize');
    await dealAndOpen(app);
    const token = await mintCapability(app, SEAT_S0);
    store.turnSetCalls = 0;
    store.moveCreateCalls = 0;

    const response = await app.request(`/v1/seats/${SEAT_S0}/actions`, {
      method: 'POST',
      headers: seatCapabilityHeaders(token),
      body: JSON.stringify({
        matchId: TEST_MATCH_ID,
        action: { type: 'raise', amount: 300 },
      }),
    });

    expect(response.status).toBe(200);
    expect(legalizeSpy).toHaveBeenCalled();
    expect(store.moveCreateCalls).toBe(1);
    expect(store.turnSetCalls).toBe(1);

    const actionPayload = store.moveCreateBodies.at(-1)?.payload as Record<string, unknown>;
    expect(actionPayload.kind).toBe('action');
    expect(actionPayload.action).toEqual({ type: 'raise', amount: 300 });
  });

  it('rejects off-turn and illegal actions with zero writes', async () => {
    const { app, store } = setupBettingFixture();
    await dealAndOpen(app);
    const tokenS1 = await mintCapability(app, SEAT_S1);
    store.turnSetCalls = 0;
    store.moveCreateCalls = 0;

    const offTurn = await app.request(`/v1/seats/${SEAT_S1}/actions`, {
      method: 'POST',
      headers: seatCapabilityHeaders(tokenS1),
      body: JSON.stringify({ matchId: TEST_MATCH_ID, action: { type: 'fold' } }),
    });
    expect(offTurn.status).toBe(409);
    expect(store.moveCreateCalls).toBe(0);
    expect(store.turnSetCalls).toBe(0);

    const tokenS0 = await mintCapability(app, SEAT_S0);
    const badRaise = await app.request(`/v1/seats/${SEAT_S0}/actions`, {
      method: 'POST',
      headers: seatCapabilityHeaders(tokenS0),
      body: JSON.stringify({
        matchId: TEST_MATCH_ID,
        action: { type: 'raise', amount: 150 },
      }),
    });
    expect(badRaise.status).toBe(400);
    expect(store.moveCreateCalls).toBe(0);
    expect(store.turnSetCalls).toBe(0);
  });

  it('rejects missing capability before legalize', async () => {
    const { app, store } = setupBettingFixture();
    const legalizeSpy = vi.spyOn(rules, 'legalize');
    await dealAndOpen(app);
    store.turnSetCalls = 0;
    store.moveCreateCalls = 0;

    const response = await app.request(`/v1/seats/${SEAT_S0}/actions`, {
      method: 'POST',
      headers: seatCapabilityHeaders(),
      body: JSON.stringify({ matchId: TEST_MATCH_ID, action: { type: 'fold' } }),
    });

    expect(response.status).toBe(403);
    expect(legalizeSpy).not.toHaveBeenCalled();
    expect(store.moveCreateCalls).toBe(0);
    expect(store.turnSetCalls).toBe(0);
  });

  it('reconciles 409 illegal_turn without retry writes', async () => {
    const { app, store } = setupBettingFixture();
    await dealAndOpen(app);
    const token = await mintCapability(app, SEAT_S0);
    store.turnSetCalls = 0;
    store.moveCreateCalls = 0;
    store.moveCreateError = new TurnurApiError(409, 'illegal_turn');
    const beforeMoves = store.movesListCalls;
    const beforeTurnGet = store.turnGetCalls;

    const response = await app.request(`/v1/seats/${SEAT_S0}/actions`, {
      method: 'POST',
      headers: seatCapabilityHeaders(token),
      body: JSON.stringify({ matchId: TEST_MATCH_ID, action: { type: 'fold' } }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'illegal_turn' });
    expect(store.movesListCalls).toBeGreaterThan(beforeMoves);
    expect(store.turnGetCalls).toBeGreaterThan(beforeTurnGet);
    expect(store.turnSetCalls).toBe(0);
  });

  it('refuses open and actions when Turnur session is unavailable', async () => {
    const store = createFakeSeatStore();
    seedFakeSeats(store, TEST_MATCH_ID, [SEAT_S0, SEAT_S1]);
    const fakeClient = createFakeTurnurClientWithSeats(store);
    const getClient = vi.fn(async () => {
      throw new TurnurAuthenticationError('missing_key');
    });
    const { app } = createTestApp({
      handDeps: { getClient, rng: createSeededRng(1) },
      actionDeps: { getClient },
    });

    const open = await app.request('/v1/hands/betting/open', {
      method: 'POST',
      headers: authHeaders(),
      body: openBody(),
    });
    expect(open.status).toBe(503);
    expect(store.turnSetCalls).toBe(0);
    expect(store.moveCreateCalls).toBe(0);
  });
});
