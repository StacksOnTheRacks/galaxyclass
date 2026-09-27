import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TurnurApiError } from '@turnur/sdk';
import * as seatGate from '../src/server/seats/capability/gate.js';
import {
  authenticateTurnurSession,
  requireAuthenticatedTurnurClient,
  resetTurnurSession,
  TurnurAuthenticationError,
} from '../src/server/turnur/session.js';
import {
  createFakeSeatStore,
  createFakeTurnurClientWithSeats,
} from './helpers/fake-turnur-seats.js';
import { TEST_HOST_API_KEY, TEST_MATCH_ID } from './helpers/fixtures.js';
import { authHeaders, createTestApp } from './helpers/test-app.js';
import {
  TEST_TURNUR_BASE_URL,
  TEST_TURNUR_SDK_KEY,
} from './helpers/turnur-fixtures.js';

const IDENTITY_DENYLIST = [
  'playerId',
  'playerSubject',
  'userId',
  'user',
  'subject',
  'displayName',
  'name',
  'email',
  'identity',
  'hostPlayerId',
  'view',
  'hiddenView',
  'holeCards',
];

function seatBody(matchId: string = TEST_MATCH_ID) {
  return JSON.stringify({ matchId });
}

describe('POST /v1/seats and POST /v1/seats/list', () => {
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

  it('returns empty roster before any create', async () => {
    const store = createFakeSeatStore();
    const fakeClient = createFakeTurnurClientWithSeats(store);
    const getClient = vi.fn(async () => fakeClient);

    const { app } = createTestApp({ seatDeps: { getClient } });

    const response = await app.request('/v1/seats/list', {
      method: 'POST',
      headers: authHeaders(),
      body: seatBody(),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ seats: [], currentSeat: null });
    expect(store.seatListCalls).toBe(1);
    expect(store.seatCreateCalls).toBe(0);
  });

  it('creates two distinct seatIds and lists the roster without identity fields', async () => {
    const store = createFakeSeatStore();
    const fakeClient = createFakeTurnurClientWithSeats(store);
    const getClient = vi.fn(async () => fakeClient);
    const requireSeatCapabilitySpy = vi.spyOn(seatGate, 'requireSeatCapability');

    const { app } = createTestApp({ seatDeps: { getClient } });

    const first = await app.request('/v1/seats', {
      method: 'POST',
      headers: authHeaders(),
      body: seatBody(),
    });
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.currentSeat).toBeNull();
    expect(typeof firstBody.seatId).toBe('string');

    const second = await app.request('/v1/seats', {
      method: 'POST',
      headers: authHeaders(),
      body: seatBody(),
    });
    expect(second.status).toBe(201);
    const secondBody = await second.json();
    expect(secondBody.seatId).not.toBe(firstBody.seatId);

    for (const key of IDENTITY_DENYLIST) {
      expect(firstBody[key]).toBeUndefined();
      expect(secondBody[key]).toBeUndefined();
    }

    const list = await app.request('/v1/seats/list', {
      method: 'POST',
      headers: authHeaders(),
      body: seatBody(),
    });
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.currentSeat).toBeNull();
    expect(listBody.seats).toHaveLength(2);
    expect(listBody.seats.map((seat: { seatId: string }) => seat.seatId).sort()).toEqual(
      [firstBody.seatId, secondBody.seatId].sort(),
    );

    for (const seat of listBody.seats) {
      expect(Object.keys(seat).sort()).toEqual(['createdAt', 'seatId']);
      for (const key of IDENTITY_DENYLIST) {
        expect(seat[key]).toBeUndefined();
      }
    }

    expect(store.seatCreateCalls).toBe(2);
    expect(store.turnSetCalls).toBe(0);
    expect(store.viewPutCalls).toBe(0);
    expect(store.moveCreateCalls).toBe(0);
    expect(requireSeatCapabilitySpy).not.toHaveBeenCalled();
    expect(fakeClient.match.seat.create).toHaveBeenCalledWith(TEST_MATCH_ID);
    expect(fakeClient.match.seat.create).toHaveBeenCalledTimes(2);
  });

  it('rejects unauthenticated host create and list with zero Turnur calls', async () => {
    const store = createFakeSeatStore();
    const fakeClient = createFakeTurnurClientWithSeats(store);
    const getClient = vi.fn(async () => fakeClient);

    const { app } = createTestApp({ seatDeps: { getClient } });

    for (const path of ['/v1/seats', '/v1/seats/list']) {
      const response = await app.request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: seatBody(),
      });
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('unauthorized');
    }

    const wrongSecret = await app.request('/v1/seats', {
      method: 'POST',
      headers: authHeaders('wrong-secret'),
      body: seatBody(),
    });
    expect(wrongSecret.status).toBe(401);
    expect(store.seatCreateCalls).toBe(0);
    expect(store.seatListCalls).toBe(0);
  });

  it('does not authorize create with seat capability header alone', async () => {
    const store = createFakeSeatStore();
    const fakeClient = createFakeTurnurClientWithSeats(store);
    const getClient = vi.fn(async () => fakeClient);

    const { app } = createTestApp({ seatDeps: { getClient } });

    const response = await app.request('/v1/seats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Riffle-Seat-Capability': 'a'.repeat(64),
      },
      body: seatBody(),
    });

    expect(response.status).toBe(401);
    expect(store.seatCreateCalls).toBe(0);
  });

  it('refuses create when Turnur session is missing SDK key', async () => {
    const store = createFakeSeatStore();
    const fakeClient = createFakeTurnurClientWithSeats(store);
    const getClient = vi.fn(async () => {
      throw new TurnurAuthenticationError('missing_key');
    });

    const { app } = createTestApp({ seatDeps: { getClient } });

    const response = await app.request('/v1/seats', {
      method: 'POST',
      headers: authHeaders(),
      body: seatBody(),
    });

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ error: 'turnur_unauthenticated', reason: 'missing_key' });
    expect(store.seatCreateCalls).toBe(0);
    expect(JSON.stringify(body)).not.toContain(TEST_TURNUR_SDK_KEY);
  });

  it('refuses create when Turnur authentication fails with invalid key', async () => {
    const store = createFakeSeatStore();
    const fakeClient = createFakeTurnurClientWithSeats(store, {
      meError: new TurnurApiError(401, 'game auth required', 'game_auth_invalid'),
    });
    const createClient = vi.fn(() => fakeClient);

    await authenticateTurnurSession({
      createClient,
      baseUrl: TEST_TURNUR_BASE_URL,
      apiKey: 'turnur_sk_invalid',
    });

    const getClient = vi.fn(() => requireAuthenticatedTurnurClient());
    const { app } = createTestApp({ seatDeps: { getClient } });

    const response = await app.request('/v1/seats', {
      method: 'POST',
      headers: authHeaders(),
      body: seatBody(),
    });

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe('turnur_unauthenticated');
    expect(store.seatCreateCalls).toBe(0);
  });

  it('maps Turnur match authority errors without leaking key material', async () => {
    const cases = [
      {
        error: new TurnurApiError(404, 'not found', 'match_not_found'),
        status: 404,
        errorCode: 'match_not_found',
      },
      {
        error: new TurnurApiError(403, 'forbidden', 'match_forbidden'),
        status: 403,
        errorCode: 'match_forbidden',
      },
    ] as const;

    for (const testCase of cases) {
      const store = createFakeSeatStore();
      const fakeClient = createFakeTurnurClientWithSeats(store, {
        createError: testCase.error,
      });
      const getClient = vi.fn(async () => fakeClient);
      const { app } = createTestApp({ seatDeps: { getClient } });

      const response = await app.request('/v1/seats', {
        method: 'POST',
        headers: authHeaders(),
        body: seatBody(),
      });

      expect(response.status).toBe(testCase.status);
      const body = await response.json();
      expect(body.error).toBe(testCase.errorCode);
      expect(JSON.stringify(body)).not.toContain(TEST_TURNUR_SDK_KEY);
      expect(JSON.stringify(body)).not.toContain('Authorization');
    }
  });

  it('rejects invalid matchId without Turnur calls', async () => {
    const store = createFakeSeatStore();
    const fakeClient = createFakeTurnurClientWithSeats(store);
    const getClient = vi.fn(async () => fakeClient);
    const { app } = createTestApp({ seatDeps: { getClient } });

    const response = await app.request('/v1/seats', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ matchId: '   ' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_match_id' });
    expect(store.seatCreateCalls).toBe(0);
  });

  it('does not echo SDK key or Authorization in success and reject logs', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = createFakeSeatStore();
    const fakeClient = createFakeTurnurClientWithSeats(store);
    const getClient = vi.fn(async () => fakeClient);
    const { app } = createTestApp({ seatDeps: { getClient } });

    const success = await app.request('/v1/seats', {
      method: 'POST',
      headers: authHeaders(),
      body: seatBody(),
    });
    expect(success.status).toBe(201);
    const successBody = await success.json();
    expect(JSON.stringify(successBody)).not.toContain(TEST_HOST_API_KEY);
    expect(JSON.stringify(successBody)).not.toContain(TEST_TURNUR_SDK_KEY);

    const fail = await app.request('/v1/seats', {
      method: 'POST',
      headers: authHeaders('bad-key'),
      body: seatBody(),
    });
    expect(fail.status).toBe(401);
    const failBody = await fail.json();
    expect(JSON.stringify(failBody)).not.toContain(TEST_HOST_API_KEY);

    const logOutput = [
      ...infoSpy.mock.calls.flat().map(String),
      ...warnSpy.mock.calls.flat().map(String),
    ].join('\n');
    expect(logOutput).not.toContain(TEST_TURNUR_SDK_KEY);
    expect(logOutput).not.toContain('Authorization');
  });

  it('does not set CORS headers on seat routes', async () => {
    const store = createFakeSeatStore();
    const fakeClient = createFakeTurnurClientWithSeats(store);
    const getClient = vi.fn(async () => fakeClient);
    const { app } = createTestApp({ seatDeps: { getClient } });

    const response = await app.request('/v1/seats', {
      method: 'POST',
      headers: authHeaders(),
      body: seatBody(),
    });

    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
