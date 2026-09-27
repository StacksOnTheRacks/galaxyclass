import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as rules from '../src/rules/index.js';
import * as completeRules from '../src/rules/complete.js';
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

const SEAT_S0 = 's0';
const SEAT_S1 = 's1';

const SECRET_DENYLIST = [
  'deckRemaining',
  'burns',
  'dealer_shoe',
  'holeCards',
  'holes',
  'hiddenView',
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

function setupPublicBoardFixture() {
  const store = createFakeSeatStore();
  seedFakeSeats(store, TEST_MATCH_ID, [SEAT_S0, SEAT_S1]);
  const fakeClient = createFakeTurnurClientWithSeats(store);
  const getClient = vi.fn(async () => fakeClient);
  const rng = createSeededRng(42);
  const advanceStreetSpy = vi.spyOn(rules, 'advanceStreet');
  const completeFoldSpy = vi.spyOn(completeRules, 'completeFoldToOne');
  const showdownSpy = vi.spyOn(completeRules, 'showdown');
  const { app, stores } = createTestApp({
    seatDeps: { getClient },
    handDeps: { getClient, rng },
    tableDeps: { getClient },
    actionDeps: { getClient },
  });
  return {
    app,
    stores,
    store,
    fakeClient,
    getClient,
    advanceStreetSpy,
    completeFoldSpy,
    showdownSpy,
  };
}

async function dealAndOpen(app: ReturnType<typeof createTestApp>['app']) {
  await app.request('/v1/hands/deal', {
    method: 'POST',
    headers: authHeaders(),
    body: openBody(),
  });
  return app.request('/v1/hands/betting/open', {
    method: 'POST',
    headers: authHeaders(),
    body: openBody(),
  });
}

async function submitAction(
  app: ReturnType<typeof createTestApp>['app'],
  seatId: string,
  token: string,
  action: Record<string, unknown>,
) {
  return app.request(`/v1/seats/${seatId}/actions`, {
    method: 'POST',
    headers: seatCapabilityHeaders(token),
    body: JSON.stringify({ matchId: TEST_MATCH_ID, action }),
  });
}

async function completePreflop(app: ReturnType<typeof createTestApp>['app']) {
  const tokenS0 = await mintCapability(app, SEAT_S0);
  const tokenS1 = await mintCapability(app, SEAT_S1);
  await submitAction(app, SEAT_S0, tokenS0, { type: 'raise', amount: 300 });
  await submitAction(app, SEAT_S1, tokenS1, { type: 'call' });
}

async function completeFlop(app: ReturnType<typeof createTestApp>['app']) {
  const tokenS0 = await mintCapability(app, SEAT_S0);
  const tokenS1 = await mintCapability(app, SEAT_S1);
  await submitAction(app, SEAT_S1, tokenS1, { type: 'check' });
  await submitAction(app, SEAT_S0, tokenS0, { type: 'check' });
}

async function completeTurn(app: ReturnType<typeof createTestApp>['app']) {
  const tokenS0 = await mintCapability(app, SEAT_S0);
  const tokenS1 = await mintCapability(app, SEAT_S1);
  await submitAction(app, SEAT_S1, tokenS1, { type: 'check' });
  await submitAction(app, SEAT_S0, tokenS0, { type: 'check' });
}

describe('public board streets', () => {
  beforeEach(() => {
    resetTurnurSession();
    delete process.env.TURNUR_BASE_URL;
    delete process.env.TURNUR_SDK_KEY;
  });

  afterEach(() => {
    resetTurnurSession();
    vi.restoreAllMocks();
  });

  it('persists dealer shoe on deal without player view.put for deck', async () => {
    const { app, store } = setupPublicBoardFixture();
    await dealAndOpen(app);

    expect(store.seatCreateCalls).toBe(1);
    const shoePut = store.viewPutBodies.find(
      (body) =>
        typeof body.view === 'object' &&
        body.view !== null &&
        (body.view as { kind?: string }).kind === 'dealer_shoe',
    );
    expect(shoePut).toBeDefined();
    expect(store.viewPutBodies.every((body) => body.seatId === SEAT_S0 || body.seatId === SEAT_S1 || body === shoePut)).toBe(
      true,
    );
    for (const body of store.viewPutBodies) {
      if (body.seatId === SEAT_S0 || body.seatId === SEAT_S1) {
        expect((body.view as { hole?: unknown }).hole).toBeDefined();
        expect((body.view as { deckRemaining?: unknown }).deckRemaining).toBeUndefined();
      }
    }
  });

  it('has no board before first street deal and adds flop after preflop complete', async () => {
    const { app, store, advanceStreetSpy } = setupPublicBoardFixture();
    await dealAndOpen(app);

    const beforeStreet = await app.request(`/v1/table?matchId=${TEST_MATCH_ID}`);
    const beforeBody = await beforeStreet.json();
    expect(beforeBody.board).toBeUndefined();

    advanceStreetSpy.mockClear();
    await completePreflop(app);

    expect(advanceStreetSpy).toHaveBeenCalledTimes(1);

    const viewGetsBeforeTable = store.viewGetCalls;
    const table = await app.request(`/v1/table?matchId=${TEST_MATCH_ID}`);
    const tableBody = await table.json();
    expect(tableBody.board).toHaveLength(3);
    expect(store.viewGetCalls).toBe(viewGetsBeforeTable);

    const streetDeal = store.moveCreateBodies.find(
      (body) =>
        typeof body.payload === 'object' &&
        body.payload !== null &&
        (body.payload as { kind?: string }).kind === 'street_deal',
    );
    expect(streetDeal).toBeDefined();
    const payload = streetDeal!.payload as { board: string[]; street: string };
    expect(payload.street).toBe('flop');
    expect(payload.board).toEqual(tableBody.board);
    for (const key of SECRET_DENYLIST) {
      expect((payload as Record<string, unknown>)[key]).toBeUndefined();
    }
  });

  it('shows the same board for every seat-scoped table read', async () => {
    const { app } = setupPublicBoardFixture();
    await dealAndOpen(app);
    await completePreflop(app);

    const tokenS0 = await mintCapability(app, SEAT_S0);
    const tokenS1 = await mintCapability(app, SEAT_S1);

    const tableS0 = await app.request(
      `/v1/seats/${SEAT_S0}/table?matchId=${TEST_MATCH_ID}`,
      { headers: seatCapabilityHeaders(tokenS0) },
    );
    const tableS1 = await app.request(
      `/v1/seats/${SEAT_S1}/table?matchId=${TEST_MATCH_ID}`,
      { headers: seatCapabilityHeaders(tokenS1) },
    );

    const bodyS0 = await tableS0.json();
    const bodyS1 = await tableS1.json();
    expect(bodyS0.board).toEqual(bodyS1.board);
    expect(bodyS0.board).toHaveLength(3);
    expect(bodyS0.hole).toHaveLength(2);
    expect(bodyS1.hole).toHaveLength(2);
  });

  it('advances flop to turn to river with betting reopen after each street', async () => {
    const { app, store, advanceStreetSpy } = setupPublicBoardFixture();
    await dealAndOpen(app);
    await completePreflop(app);
    advanceStreetSpy.mockClear();

    await completeFlop(app);
    expect(advanceStreetSpy).toHaveBeenCalledTimes(1);

    let tableBody = await (await app.request(`/v1/table?matchId=${TEST_MATCH_ID}`)).json();
    expect(tableBody.board).toHaveLength(4);
    expect(tableBody.currentSeat).toBe(SEAT_S1);

    advanceStreetSpy.mockClear();
    await completeTurn(app);
    expect(advanceStreetSpy).toHaveBeenCalledTimes(1);

    tableBody = await (await app.request(`/v1/table?matchId=${TEST_MATCH_ID}`)).json();
    expect(tableBody.board).toHaveLength(5);
    expect(tableBody.currentSeat).toBe(SEAT_S1);

    const streetDeals = store.moveCreateBodies.filter(
      (body) =>
        typeof body.payload === 'object' &&
        body.payload !== null &&
        (body.payload as { kind?: string }).kind === 'street_deal',
    );
    expect(streetDeals).toHaveLength(3);
  });

  it('does not advance after river street complete', async () => {
    const { app, advanceStreetSpy } = setupPublicBoardFixture();
    await dealAndOpen(app);
    await completePreflop(app);
    await completeFlop(app);
    await completeTurn(app);

    advanceStreetSpy.mockClear();
    const tokenS0 = await mintCapability(app, SEAT_S0);
    const tokenS1 = await mintCapability(app, SEAT_S1);
    await submitAction(app, SEAT_S1, tokenS1, { type: 'check' });
    await submitAction(app, SEAT_S0, tokenS0, { type: 'check' });

    expect(advanceStreetSpy).not.toHaveBeenCalled();

    const tableBody = await (await app.request(`/v1/table?matchId=${TEST_MATCH_ID}`)).json();
    expect(tableBody.board).toHaveLength(5);
  });

  it('never calls completeFoldToOne or showdown on street advance', async () => {
    const { app, completeFoldSpy, showdownSpy } = setupPublicBoardFixture();
    await dealAndOpen(app);
    await completePreflop(app);
    await completeFlop(app);
    expect(completeFoldSpy).not.toHaveBeenCalled();
    expect(showdownSpy).not.toHaveBeenCalled();
  });

  it('refuses street deal when Turnur session is unavailable', async () => {
    const store = createFakeSeatStore();
    seedFakeSeats(store, TEST_MATCH_ID, [SEAT_S0, SEAT_S1]);
    const fakeClient = createFakeTurnurClientWithSeats(store);
    const getClient = vi.fn(async () => fakeClient);
    const rng = createSeededRng(42);
    const advanceStreetSpy = vi.spyOn(rules, 'advanceStreet');

    const { app } = createTestApp({
      seatDeps: { getClient },
      handDeps: { getClient, rng },
      tableDeps: { getClient },
      actionDeps: { getClient },
    });
    await dealAndOpen(app);
    await completePreflop(app);
    const tokenS1 = await mintCapability(app, SEAT_S1);

    const beforeMoves = store.moveCreateCalls;
    const beforeTurnSet = store.turnSetCalls;
    advanceStreetSpy.mockClear();
    getClient.mockImplementation(async () => {
      throw new TurnurAuthenticationError('missing_key');
    });

    const response = await submitAction(app, SEAT_S1, tokenS1, { type: 'check' });
    expect(response.status).toBe(503);
    expect(advanceStreetSpy).not.toHaveBeenCalled();
    expect(store.moveCreateCalls).toBe(beforeMoves);
    expect(store.turnSetCalls).toBe(beforeTurnSet);
  });

  it('does not write board or shoe onto player hidden views', async () => {
    const { app, store } = setupPublicBoardFixture();
    await dealAndOpen(app);
    await completePreflop(app);

    for (const body of store.viewPutBodies) {
      if (body.seatId === SEAT_S0 || body.seatId === SEAT_S1) {
        expect((body.view as { board?: unknown }).board).toBeUndefined();
        expect((body.view as { deckRemaining?: unknown }).deckRemaining).toBeUndefined();
        expect((body.view as { burns?: unknown }).burns).toBeUndefined();
      }
    }
  });

  it('includes shoeSeatId on hand_open', async () => {
    const { app, store } = setupPublicBoardFixture();
    await dealAndOpen(app);
    const handOpen = store.moveCreateBodies.find(
      (body) =>
        typeof body.payload === 'object' &&
        body.payload !== null &&
        (body.payload as { kind?: string }).kind === 'hand_open',
    );
    expect((handOpen!.payload as { shoeSeatId?: string }).shoeSeatId).toBeDefined();
  });
});
