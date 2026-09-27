import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const SEAT_S2 = 's2';

const SECRET_DENYLIST = [
  'deckRemaining',
  'burns',
  'dealer_shoe',
  'holeCards',
  'holes',
  'hiddenView',
  'HandState',
];

function openBody(seats: string[] = [SEAT_S0, SEAT_S1]) {
  return JSON.stringify({
    matchId: TEST_MATCH_ID,
    seats: seats.map((seatId) => ({ seatId, stack: 10000 })),
    buttonSeatId: SEAT_S0,
    blinds: { smallBlind: 50, bigBlind: 100 },
  });
}

async function dealAndOpen(
  app: ReturnType<typeof createTestApp>['app'],
  seats: string[] = [SEAT_S0, SEAT_S1],
) {
  const body = openBody(seats);
  await app.request('/v1/hands/deal', {
    method: 'POST',
    headers: authHeaders(),
    body,
  });
  return app.request('/v1/hands/betting/open', {
    method: 'POST',
    headers: authHeaders(),
    body,
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

function setupRevealFixture(seatIds: string[] = [SEAT_S0, SEAT_S1, SEAT_S2]) {
  const store = createFakeSeatStore();
  seedFakeSeats(store, TEST_MATCH_ID, seatIds);
  const fakeClient = createFakeTurnurClientWithSeats(store);
  const getClient = vi.fn(async () => fakeClient);
  const rng = createSeededRng(42);
  const { app } = createTestApp({
    seatDeps: { getClient },
    handDeps: { getClient, rng },
    tableDeps: { getClient },
    actionDeps: { getClient },
  });
  return { app, store, getClient };
}

async function dealAndOpenThreeSeat(app: ReturnType<typeof createTestApp>['app']) {
  return dealAndOpen(app, [SEAT_S0, SEAT_S1, SEAT_S2]);
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

describe('hand complete reveal and public projection', () => {
  beforeEach(() => {
    resetTurnurSession();
    delete process.env.TURNUR_BASE_URL;
    delete process.env.TURNUR_SDK_KEY;
  });

  afterEach(() => {
    resetTurnurSession();
    vi.restoreAllMocks();
  });

  it('never view.get on public table before or after complete', async () => {
    const { app, store } = setupRevealFixture([SEAT_S0, SEAT_S1]);
    await dealAndOpen(app, [SEAT_S0, SEAT_S1]);

    const viewGetsBefore = store.viewGetCalls;
    await app.request(`/v1/table?matchId=${TEST_MATCH_ID}`);
    expect(store.viewGetCalls).toBe(viewGetsBefore);

    const tokenS0 = await mintCapability(app, SEAT_S0);
    const tokenS1 = await mintCapability(app, SEAT_S1);
    await submitAction(app, SEAT_S0, tokenS0, { type: 'raise', amount: 300 });
    await submitAction(app, SEAT_S1, tokenS1, { type: 'fold' });

    const viewGetsAfter = store.viewGetCalls;
    const table = await app.request(`/v1/table?matchId=${TEST_MATCH_ID}`);
    const tableBody = await table.json();
    expect(store.viewGetCalls).toBe(viewGetsAfter);
    expect(tableBody.shownHoles).toBeUndefined();
    for (const key of SECRET_DENYLIST) {
      expect(tableBody[key]).toBeUndefined();
    }
  });

  it('fold-to-one does not publish other-seat holes on public table', async () => {
    const { app } = setupRevealFixture([SEAT_S0, SEAT_S1]);
    await dealAndOpen(app, [SEAT_S0, SEAT_S1]);

    const tokenS0 = await mintCapability(app, SEAT_S0);
    const tokenS1 = await mintCapability(app, SEAT_S1);
    await submitAction(app, SEAT_S0, tokenS0, { type: 'raise', amount: 300 });
    await submitAction(app, SEAT_S1, tokenS1, { type: 'fold' });

    const tableBody = await (
      await app.request(`/v1/table?matchId=${TEST_MATCH_ID}`)
    ).json();
    expect(tableBody.completeReason).toBe('fold_to_one');
    expect(tableBody.shownHoles).toBeUndefined();
    expect(JSON.stringify(tableBody)).not.toMatch(/"hole":\s*\[/);
  });

  it('showdown publishes shown holes for still-in seats only', async () => {
    vi.spyOn(completeRules, 'showdown');
    const { app, store } = setupRevealFixture();
    await dealAndOpenThreeSeat(app);

    const tokenS0 = await mintCapability(app, SEAT_S0);
    const tokenS1 = await mintCapability(app, SEAT_S1);
    const tokenS2 = await mintCapability(app, SEAT_S2);

    await submitAction(app, SEAT_S0, tokenS0, { type: 'fold' });
    await submitAction(app, SEAT_S1, tokenS1, { type: 'raise', amount: 300 });
    await submitAction(app, SEAT_S2, tokenS2, { type: 'call' });
    await submitAction(app, SEAT_S1, tokenS1, { type: 'check' });
    await submitAction(app, SEAT_S2, tokenS2, { type: 'check' });
    await submitAction(app, SEAT_S1, tokenS1, { type: 'check' });
    await submitAction(app, SEAT_S2, tokenS2, { type: 'check' });
    await submitAction(app, SEAT_S1, tokenS1, { type: 'check' });
    await submitAction(app, SEAT_S2, tokenS2, { type: 'check' });
    await submitAction(app, SEAT_S1, tokenS1, { type: 'check' });
    await submitAction(app, SEAT_S2, tokenS2, { type: 'check' });

    const tableBody = await (
      await app.request(`/v1/table?matchId=${TEST_MATCH_ID}`)
    ).json();
    expect(tableBody.completeReason).toBe('showdown');
    expect(tableBody.shownHoles).toBeDefined();
    const shownSeatIds = tableBody.shownHoles.map((entry: { seatId: string }) => entry.seatId);
    expect(shownSeatIds).toContain(SEAT_S1);
    expect(shownSeatIds).toContain(SEAT_S2);
    expect(shownSeatIds).not.toContain(SEAT_S0);

    const tokenS1Table = await app.request(
      `/v1/seats/${SEAT_S1}/table?matchId=${TEST_MATCH_ID}`,
      { headers: seatCapabilityHeaders(tokenS1) },
    );
    const seatTableBody = await tokenS1Table.json();
    expect(seatTableBody.shownHoles).toEqual(tableBody.shownHoles);

    const holeCopies = store.viewPutBodies.filter(
      (body) =>
        (body.seatId === SEAT_S0 || body.seatId === SEAT_S1 || body.seatId === SEAT_S2) &&
        typeof body.view === 'object' &&
        body.view !== null &&
        Array.isArray((body.view as { hole?: unknown }).hole) &&
        body.seatId !== (store.viewPutBodies[0]?.seatId ?? ''),
    );
    expect(holeCopies.every((body) => !(body.view as { copied?: boolean }).copied)).toBe(true);
  });

  it('capability A cannot read seat B view for folded holes', async () => {
    const { app } = setupRevealFixture([SEAT_S0, SEAT_S1]);
    await dealAndOpen(app, [SEAT_S0, SEAT_S1]);

    const tokenS0 = await mintCapability(app, SEAT_S0);
    const tokenS1 = await mintCapability(app, SEAT_S1);
    await submitAction(app, SEAT_S0, tokenS0, { type: 'raise', amount: 300 });
    await submitAction(app, SEAT_S1, tokenS1, { type: 'fold' });

    const viewResponse = await app.request(
      `/v1/seats/${SEAT_S1}/view?matchId=${TEST_MATCH_ID}`,
      { headers: seatCapabilityHeaders(tokenS0) },
    );
    expect([403, 404]).toContain(viewResponse.status);
    const bodyText = await viewResponse.text();
    expect(bodyText).not.toMatch(/"hole"\s*:\s*\["/);
  });
});
