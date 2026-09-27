import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as bootstrapMint from '../src/server/bootstrap/mint.js';
import * as dealModule from '../src/server/hands/deal.js';
import * as openModule from '../src/server/hands/open.js';
import { normalizeFrameAncestors, parseLabEnabled } from '../src/server/env.js';
import * as capabilityMint from '../src/server/seats/capability/mint.js';
import {
  createFakeSeatStore,
  createFakeTurnurClientWithSeats,
} from './helpers/fake-turnur-seats.js';
import {
  TEST_HOST_API_KEY,
  TEST_PUBLIC_ORIGIN,
} from './helpers/fixtures.js';
import { authHeaders, createTestApp } from './helpers/test-app.js';
import {
  TEST_TURNUR_BASE_URL,
  TEST_TURNUR_SDK_KEY,
} from './helpers/turnur-fixtures.js';

const LAB_SESSION_PATH = '/v1/lab/session';

function loopbackLabApp(
  options: {
    remoteAddress?: string | undefined;
    labEnabled?: boolean;
  } = {},
) {
  const store = createFakeSeatStore();
  const fakeClient = createFakeTurnurClientWithSeats(store);
  const getClient = vi.fn(async () => fakeClient);
  const remoteAddress =
    options.remoteAddress === undefined && 'remoteAddress' in options
      ? undefined
      : (options.remoteAddress ?? '127.0.0.1');

  const { app, stores } = createTestApp({
    labEnabled: options.labEnabled ?? true,
    matchDeps: { getClient },
    seatDeps: { getClient },
    labDeps: {
      getClient,
      getRemoteAddress: () => remoteAddress,
    },
  });

  return { app, stores, store, fakeClient, getClient };
}

async function postLabSession(
  app: ReturnType<typeof createTestApp>['app'],
  options: {
    headers?: HeadersInit;
    body?: string;
  } = {},
) {
  return app.request(LAB_SESSION_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body ?? '{}',
  });
}

describe('POST /v1/lab/session', () => {
  beforeEach(() => {
    vi.spyOn(bootstrapMint, 'mintBootstrap');
    vi.spyOn(capabilityMint, 'mintSeatCapability');
    vi.spyOn(dealModule, 'dealHandForMatch');
    vi.spyOn(openModule, 'openBetting');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 201 with matchId and two lab seats when flag is on and caller is loopback', async () => {
    const { app, store, fakeClient } = loopbackLabApp();

    const response = await postLabSession(app);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(typeof body.matchId).toBe('string');
    expect(body.matchId.length).toBeGreaterThan(0);
    expect(body.seats).toHaveLength(2);

    for (const seat of body.seats) {
      expect(typeof seat.seatId).toBe('string');
      expect(seat.seatId.length).toBeGreaterThan(0);
      expect(seat.playUrl).toMatch(
        new RegExp(`^${TEST_PUBLIC_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/play#bt=`),
      );
      expect(seat.playUrl).not.toContain('?');
      expect(typeof seat.capabilityToken).toBe('string');
      expect(seat.capabilityToken.length).toBeGreaterThan(0);
      expect(seat.playerSubject).toBe(`lab:${seat.seatId}`);
    }

    expect(store.matchCreateCalls).toBe(1);
    expect(fakeClient.match.create).toHaveBeenCalledTimes(1);
    expect(fakeClient.match.seat.create).toHaveBeenCalledTimes(2);
    expect(bootstrapMint.mintBootstrap).toHaveBeenCalledTimes(2);
    expect(capabilityMint.mintSeatCapability).toHaveBeenCalledTimes(2);
    expect(dealModule.dealHandForMatch).not.toHaveBeenCalled();
    expect(openModule.openBetting).not.toHaveBeenCalled();

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(TEST_HOST_API_KEY);
    expect(serialized).not.toContain(TEST_TURNUR_SDK_KEY);
    expect(serialized).not.toContain(TEST_TURNUR_BASE_URL);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])(
    'allows loopback address %s when flag is on',
    async (remoteAddress) => {
      const { app, store } = loopbackLabApp({ remoteAddress });

      const response = await postLabSession(app);

      expect(response.status).toBe(201);
      expect(store.matchCreateCalls).toBe(1);
    },
  );

  it.each([
    ['flag omitted', { labEnabled: false }],
    ['flag false string', { labEnabled: parseLabEnabled('false') }],
    ['flag zero string', { labEnabled: parseLabEnabled('0') }],
    ['flag yes string', { labEnabled: parseLabEnabled('yes') }],
    ['flag on string', { labEnabled: parseLabEnabled('on') }],
  ])('rejects when %s even with host Bearer and creates nothing', async (_label, envOverride) => {
    const store = createFakeSeatStore();
    const fakeClient = createFakeTurnurClientWithSeats(store);
    const getClient = vi.fn(async () => fakeClient);

    const { app } = createTestApp({
      ...envOverride,
      matchDeps: { getClient },
      seatDeps: { getClient },
      labDeps: {
        getClient,
        getRemoteAddress: () => '127.0.0.1',
      },
    });

    const response = await postLabSession(app, { headers: authHeaders() });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'lab_disabled' });
    expect(store.matchCreateCalls).toBe(0);
    expect(fakeClient.match.create).not.toHaveBeenCalled();
  });

  it.each([
    ['public IPv4', '8.8.8.8'],
    ['RFC1918', '10.0.0.5'],
    ['missing address', undefined],
  ])('rejects non-loopback client (%s) and creates nothing', async (_label, remoteAddress) => {
    const { app, store, fakeClient } = loopbackLabApp({ remoteAddress: remoteAddress as string | undefined });

    const response = await postLabSession(app);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'lab_forbidden' });
    expect(store.matchCreateCalls).toBe(0);
    expect(fakeClient.match.create).not.toHaveBeenCalled();
  });

  it('does not trust X-Forwarded-For when injected remote address is non-loopback', async () => {
    const { app, store, fakeClient } = loopbackLabApp({ remoteAddress: '8.8.8.8' });

    const response = await postLabSession(app, {
      headers: {
        'X-Forwarded-For': '127.0.0.1',
      },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'lab_forbidden' });
    expect(store.matchCreateCalls).toBe(0);
    expect(fakeClient.match.create).not.toHaveBeenCalled();
  });

  it('rejects non-JSON Content-Type and creates nothing', async () => {
    const { app, store, fakeClient } = loopbackLabApp();

    const response = await app.request(LAB_SESSION_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: '{}',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_content_type' });
    expect(store.matchCreateCalls).toBe(0);
    expect(fakeClient.match.create).not.toHaveBeenCalled();
  });

  it('accepts flag true case-insensitively', async () => {
    const store = createFakeSeatStore();
    const fakeClient = createFakeTurnurClientWithSeats(store);
    const getClient = vi.fn(async () => fakeClient);

    const { app } = createTestApp({
      labEnabled: parseLabEnabled('TRUE'),
      matchDeps: { getClient },
      seatDeps: { getClient },
      labDeps: {
        getClient,
        getRemoteAddress: () => '127.0.0.1',
      },
    });

    const response = await postLabSession(app);

    expect(response.status).toBe(201);
    expect(store.matchCreateCalls).toBe(1);
  });
});

describe('normalizeFrameAncestors', () => {
  it('quotes bare self so CSP frame-ancestors is valid', () => {
    expect(normalizeFrameAncestors('self')).toBe("'self'");
    expect(normalizeFrameAncestors("'self'")).toBe("'self'");
    expect(normalizeFrameAncestors("self https://host.example")).toBe(
      "'self' https://host.example",
    );
  });
});

describe('GET /v1/lab/session', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates no match and mints no tokens', async () => {
    const mintBootstrapSpy = vi.spyOn(bootstrapMint, 'mintBootstrap');
    const mintCapabilitySpy = vi.spyOn(capabilityMint, 'mintSeatCapability');
    const { app, store, fakeClient } = loopbackLabApp();

    const response = await app.request(LAB_SESSION_PATH, { method: 'GET' });

    expect(response.status).toBe(405);
    expect(store.matchCreateCalls).toBe(0);
    expect(fakeClient.match.create).not.toHaveBeenCalled();
    expect(mintBootstrapSpy).not.toHaveBeenCalled();
    expect(mintCapabilitySpy).not.toHaveBeenCalled();
  });
});
