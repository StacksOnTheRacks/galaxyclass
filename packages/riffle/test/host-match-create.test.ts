import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TurnurApiError } from '@turnur/sdk';
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
import { TEST_HOST_API_KEY } from './helpers/fixtures.js';
import { authHeaders, createTestApp } from './helpers/test-app.js';
import {
  TEST_TURNUR_BASE_URL,
  TEST_TURNUR_SDK_KEY,
} from './helpers/turnur-fixtures.js';

describe('POST /v1/matches', () => {
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

  it('returns 201 with matchId when host auth and Turnur session are valid', async () => {
    const store = createFakeSeatStore();
    const fakeClient = createFakeTurnurClientWithSeats(store);
    const getClient = vi.fn(async () => fakeClient);

    const { app } = createTestApp({ matchDeps: { getClient } });

    const response = await app.request('/v1/matches', {
      method: 'POST',
      headers: authHeaders(),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(typeof body.matchId).toBe('string');
    expect(body.matchId.length).toBeGreaterThan(0);
    expect(store.matchCreateCalls).toBe(1);
    expect(fakeClient.match.create).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(body)).not.toContain(TEST_HOST_API_KEY);
    expect(JSON.stringify(body)).not.toContain(TEST_TURNUR_SDK_KEY);
  });

  it('rejects missing, absent, or wrong host Bearer token with zero Turnur calls', async () => {
    const store = createFakeSeatStore();
    const fakeClient = createFakeTurnurClientWithSeats(store);
    const getClient = vi.fn(async () => fakeClient);

    const { app } = createTestApp({ matchDeps: { getClient } });

    const missing = await app.request('/v1/matches', { method: 'POST' });
    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({ error: 'unauthorized' });

    const wrong = await app.request('/v1/matches', {
      method: 'POST',
      headers: authHeaders('wrong-secret'),
    });
    expect(wrong.status).toBe(401);

    expect(store.matchCreateCalls).toBe(0);
    expect(fakeClient.match.create).not.toHaveBeenCalled();
  });

  it('returns 503 when Turnur session is not authenticated', async () => {
    const store = createFakeSeatStore();
    const fakeClient = createFakeTurnurClientWithSeats(store);
    const getClient = vi.fn(async () => {
      throw new TurnurAuthenticationError('missing_key');
    });

    const { app } = createTestApp({ matchDeps: { getClient } });

    const response = await app.request('/v1/matches', {
      method: 'POST',
      headers: authHeaders(),
    });

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ error: 'turnur_unauthenticated', reason: 'missing_key' });
    expect(body.matchId).toBeUndefined();
    expect(store.matchCreateCalls).toBe(0);
    expect(JSON.stringify(body)).not.toContain(TEST_TURNUR_SDK_KEY);
  });

  it('returns 503 when Turnur authentication probe fails with invalid key', async () => {
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
    const { app } = createTestApp({ matchDeps: { getClient } });

    const response = await app.request('/v1/matches', {
      method: 'POST',
      headers: authHeaders(),
    });

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe('turnur_unauthenticated');
    expect(body.matchId).toBeUndefined();
    expect(store.matchCreateCalls).toBe(0);
  });

  it('does not set CORS headers on POST /v1/matches', async () => {
    const store = createFakeSeatStore();
    const fakeClient = createFakeTurnurClientWithSeats(store);
    const getClient = vi.fn(async () => fakeClient);

    const { app } = createTestApp({ matchDeps: { getClient } });

    const response = await app.request('/v1/matches', {
      method: 'POST',
      headers: authHeaders(),
    });

    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
