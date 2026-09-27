import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as rules from '../src/rules/index.js';
import * as completeRules from '../src/rules/complete.js';
import { createSeededRng } from '../src/rules/rng.js';
import { SEAT_CAPABILITY_HEADER } from '../src/server/table/routes.js';
import { resetTurnurSession } from '../src/server/turnur/session.js';
import {
  createFakeSeatStore,
  createFakeTurnurClientWithSeats,
  seedFakeSeats,
} from './helpers/fake-turnur-seats.js';
import { TEST_MATCH_ID, TEST_PLAYER_SUBJECT } from './helpers/fixtures.js';
import { authHeaders, createTestApp } from './helpers/test-app.js';

const SEAT_S0 = 's0';
const SEAT_S1 = 's1';

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

function setupHandCompleteFixture() {
  const store = createFakeSeatStore();
  seedFakeSeats(store, TEST_MATCH_ID, [SEAT_S0, SEAT_S1]);
  const fakeClient = createFakeTurnurClientWithSeats(store);
  const getClient = vi.fn(async () => fakeClient);
  const rng = createSeededRng(42);
  const advanceStreetSpy = vi.spyOn(rules, 'advanceStreet');
  const completeFoldSpy = vi.spyOn(completeRules, 'completeFoldToOne');
  const showdownSpy = vi.spyOn(completeRules, 'showdown');
  const { app } = createTestApp({
    seatDeps: { getClient },
    handDeps: { getClient, rng },
    tableDeps: { getClient },
    actionDeps: { getClient },
  });
  return { app, store, getClient, advanceStreetSpy, completeFoldSpy, showdownSpy };
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

async function completeRiverChecks(app: ReturnType<typeof createTestApp>['app']) {
  const tokenS0 = await mintCapability(app, SEAT_S0);
  const tokenS1 = await mintCapability(app, SEAT_S1);
  await submitAction(app, SEAT_S1, tokenS1, { type: 'check' });
  return submitAction(app, SEAT_S0, tokenS0, { type: 'check' });
}

describe('hand complete runtime', () => {
  beforeEach(() => {
    resetTurnurSession();
    delete process.env.TURNUR_BASE_URL;
    delete process.env.TURNUR_SDK_KEY;
  });

  afterEach(() => {
    resetTurnurSession();
    vi.restoreAllMocks();
  });

  it('awards fold-to-one with one completeFoldToOne and hand_complete move', async () => {
    const { app, store, completeFoldSpy, showdownSpy, advanceStreetSpy } =
      setupHandCompleteFixture();
    await dealAndOpen(app);

    const tokenS0 = await mintCapability(app, SEAT_S0);
    const tokenS1 = await mintCapability(app, SEAT_S1);

    advanceStreetSpy.mockClear();
    completeFoldSpy.mockClear();
    showdownSpy.mockClear();

    await submitAction(app, SEAT_S0, tokenS0, { type: 'raise', amount: 300 });
    const turnSetBeforeFold = store.turnSetCalls;
    const foldResponse = await submitAction(app, SEAT_S1, tokenS1, { type: 'fold' });
    expect(foldResponse.status).toBe(200);

    expect(completeFoldSpy).toHaveBeenCalledTimes(1);
    expect(showdownSpy).not.toHaveBeenCalled();
    expect(advanceStreetSpy).not.toHaveBeenCalled();
    expect(store.turnSetCalls).toBe(turnSetBeforeFold);

    const body = await foldResponse.json();
    expect(body.pot).toBe(0);
    expect(body.currentSeat).toBeNull();
    expect(body.completeReason).toBe('fold_to_one');
    expect(body.winners).toHaveLength(1);
    expect(body.winners[0]!.seatId).toBe(SEAT_S0);
    expect(body.winners[0]!.amount).toBeGreaterThan(0);
    expect(body.shownHoles).toBeUndefined();

    const handComplete = store.moveCreateBodies.find(
      (entry) =>
        typeof entry.payload === 'object' &&
        entry.payload !== null &&
        (entry.payload as { kind?: string }).kind === 'hand_complete',
    );
    expect(handComplete).toBeDefined();
    const payload = handComplete!.payload as {
      reason: string;
      winners: Array<{ seatId: string; amount: number }>;
      shownHoles?: unknown;
    };
    expect(payload.reason).toBe('fold_to_one');
    expect(payload.shownHoles).toBeUndefined();
    expect(payload.winners[0]!.seatId).toBe(SEAT_S0);
  });

  it('awards showdown after river with one showdown call', async () => {
    const { app, store, completeFoldSpy, showdownSpy, advanceStreetSpy } =
      setupHandCompleteFixture();
    await dealAndOpen(app);
    await completePreflop(app);
    await completeFlop(app);
    await completeTurn(app);

    advanceStreetSpy.mockClear();
    completeFoldSpy.mockClear();
    showdownSpy.mockClear();

    const tokenS0 = await mintCapability(app, SEAT_S0);
    const tokenS1 = await mintCapability(app, SEAT_S1);
    await submitAction(app, SEAT_S1, tokenS1, { type: 'check' });
    const turnSetBeforeCompletingCheck = store.turnSetCalls;
    const riverResponse = await submitAction(app, SEAT_S0, tokenS0, { type: 'check' });
    expect(riverResponse.status).toBe(200);

    expect(showdownSpy).toHaveBeenCalledTimes(1);
    expect(completeFoldSpy).not.toHaveBeenCalled();
    expect(advanceStreetSpy).not.toHaveBeenCalled();
    expect(store.turnSetCalls).toBe(turnSetBeforeCompletingCheck);

    const tableBody = await (
      await app.request(`/v1/table?matchId=${TEST_MATCH_ID}`)
    ).json();
    expect(tableBody.pot).toBe(0);
    expect(tableBody.currentSeat).toBeNull();
    expect(tableBody.completeReason).toBe('showdown');
    expect(tableBody.winners).toHaveLength(1);
    expect(tableBody.shownHoles?.length).toBeGreaterThanOrEqual(2);

    const handComplete = store.moveCreateBodies.find(
      (entry) =>
        typeof entry.payload === 'object' &&
        entry.payload !== null &&
        (entry.payload as { kind?: string }).kind === 'hand_complete',
    );
    expect((handComplete!.payload as { reason: string }).reason).toBe('showdown');
  });

  it('does not call completeFoldToOne or showdown on street_complete', async () => {
    const { app, completeFoldSpy, showdownSpy } = setupHandCompleteFixture();
    await dealAndOpen(app);

    completeFoldSpy.mockClear();
    showdownSpy.mockClear();
    await completePreflop(app);

    expect(completeFoldSpy).not.toHaveBeenCalled();
    expect(showdownSpy).not.toHaveBeenCalled();
  });

  it('reconstructs awarded stacks from move log without an in-process ledger', async () => {
    const { app, store } = setupHandCompleteFixture();
    await dealAndOpen(app);

    const tokenS0 = await mintCapability(app, SEAT_S0);
    const tokenS1 = await mintCapability(app, SEAT_S1);
    await submitAction(app, SEAT_S0, tokenS0, { type: 'raise', amount: 300 });
    const foldResponse = await submitAction(app, SEAT_S1, tokenS1, { type: 'fold' });
    const foldBody = await foldResponse.json();
    const expectedAmount = foldBody.winners[0]!.amount as number;

    const logSnapshot = [...(store.moves.get(TEST_MATCH_ID) ?? [])];
    expect(logSnapshot.some((item) => (item.payload as { kind?: string }).kind === 'hand_complete')).toBe(
      true,
    );

    const freshStore = createFakeSeatStore();
    seedFakeSeats(freshStore, TEST_MATCH_ID, [SEAT_S0, SEAT_S1]);
    freshStore.moves.set(TEST_MATCH_ID, logSnapshot);
    freshStore.views = new Map(store.views);

    const freshClient = createFakeTurnurClientWithSeats(freshStore);
    const freshGetClient = vi.fn(async () => freshClient);
    const { app: freshApp } = createTestApp({
      seatDeps: { getClient: freshGetClient },
      handDeps: { getClient: freshGetClient, rng: createSeededRng(42) },
      tableDeps: { getClient: freshGetClient },
      actionDeps: { getClient: freshGetClient },
    });

    const tableBody = await (
      await freshApp.request(`/v1/table?matchId=${TEST_MATCH_ID}`)
    ).json();
    expect(tableBody.pot).toBe(0);
    expect(tableBody.currentSeat).toBeNull();
    expect(tableBody.completeReason).toBe('fold_to_one');
    expect(tableBody.winners[0].amount).toBe(expectedAmount);
  });

  it('heals missing hand_complete on the next gated action POST', async () => {
    const { app, store, completeFoldSpy } = setupHandCompleteFixture();
    await dealAndOpen(app);

    const tokenS0 = await mintCapability(app, SEAT_S0);
    const tokenS1 = await mintCapability(app, SEAT_S1);
    await submitAction(app, SEAT_S0, tokenS0, { type: 'raise', amount: 300 });
    await submitAction(app, SEAT_S1, tokenS1, { type: 'fold' });

    const moves = store.moves.get(TEST_MATCH_ID) ?? [];
    const withoutComplete = moves.filter(
      (item) => (item.payload as { kind?: string }).kind !== 'hand_complete',
    );
    store.moves.set(TEST_MATCH_ID, withoutComplete);

    completeFoldSpy.mockClear();
    const healResponse = await submitAction(app, SEAT_S0, tokenS0, { type: 'check' });
    expect(healResponse.status).toBe(409);

    expect(completeFoldSpy).toHaveBeenCalledTimes(1);
    expect(
      (store.moves.get(TEST_MATCH_ID) ?? []).some(
        (item) => (item.payload as { kind?: string }).kind === 'hand_complete',
      ),
    ).toBe(true);
  });
});
