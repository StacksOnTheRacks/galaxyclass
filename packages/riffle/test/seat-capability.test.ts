import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPlaySessionCookie } from '../src/server/bootstrap/cookie.js';
import { SeatCapabilityLedger } from '../src/server/seats/capability/ledger.js';
import {
  getSeatScopedProbeCounters,
  probeSeatScopedTurnSet,
  probeSeatScopedViewGet,
  resetSeatScopedProbeCounters,
} from '../src/server/seats/capability/probes.js';
import { SEAT_CAPABILITY_TTL_SECONDS } from '../src/server/seats/capability/token.js';
import {
  TEST_HOST_API_KEY,
  TEST_MATCH_ID,
  TEST_PLAYER_SUBJECT,
  TEST_SEAT_ID,
} from './helpers/fixtures.js';
import { authHeaders, createTestApp } from './helpers/test-app.js';

const SEAT_CAPABILITY_HEADER = 'X-Riffle-Seat-Capability';

function seatCapabilityHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token !== undefined) {
    headers[SEAT_CAPABILITY_HEADER] = token;
  }
  return headers;
}

async function mintSeatCapability(
  app: ReturnType<typeof createTestApp>['app'],
  overrides: Partial<{ matchId: string; seatId: string; playerSubject: string }> = {},
) {
  const response = await app.request('/v1/seats/capability/mint', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      matchId: TEST_MATCH_ID,
      seatId: TEST_SEAT_ID,
      playerSubject: TEST_PLAYER_SUBJECT,
      ...overrides,
    }),
  });
  return response;
}

describe('POST /v1/seats/capability/mint', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('issues a seat capability with fixture host API key', async () => {
    const { app } = createTestApp();
    const response = await mintSeatCapability(app);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.token).toMatch(/^[0-9a-f]{64}$/);
    expect(body.expiresIn).toBe(900);
    expect(body.jti).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(body.playerSubject).toBeUndefined();
    expect(body.playUrl).toBeUndefined();
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('rejects unauthenticated mint requests', async () => {
    const { app, stores } = createTestApp();

    const response = await app.request('/v1/seats/capability/mint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matchId: TEST_MATCH_ID,
        seatId: TEST_SEAT_ID,
        playerSubject: TEST_PLAYER_SUBJECT,
      }),
    });

    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe('unauthorized');
    expect(stores.seatCapabilityLedger.get('deadbeef'.repeat(8))).toBeUndefined();
  });

  it('rejects wrong bearer token', async () => {
    const { app } = createTestApp();

    const response = await app.request('/v1/seats/capability/mint', {
      method: 'POST',
      headers: authHeaders('wrong-key'),
      body: JSON.stringify({
        matchId: TEST_MATCH_ID,
        seatId: TEST_SEAT_ID,
        playerSubject: TEST_PLAYER_SUBJECT,
      }),
    });

    expect(response.status).toBe(401);
  });

  it('validates mint body fields', async () => {
    const { app } = createTestApp();

    const missingSeat = await app.request('/v1/seats/capability/mint', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ matchId: TEST_MATCH_ID, playerSubject: TEST_PLAYER_SUBJECT }),
    });
    expect(missingSeat.status).toBe(400);
    expect((await missingSeat.json()).error).toBe('invalid_seat_id');

    const missingSubject = await app.request('/v1/seats/capability/mint', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ matchId: TEST_MATCH_ID, seatId: TEST_SEAT_ID }),
    });
    expect(missingSubject.status).toBe(400);
    expect((await missingSubject.json()).error).toBe('invalid_player_subject');
  });

  it('remints for the same binding without invalidating prior token', async () => {
    const { app } = createTestApp();

    const first = await mintSeatCapability(app);
    const firstBody = await first.json();

    const second = await mintSeatCapability(app);
    const secondBody = await second.json();

    expect(firstBody.token).not.toBe(secondBody.token);
    expect(firstBody.jti).not.toBe(secondBody.jti);

    const probeFirst = await app.request('/v1/seats/capability/probe', {
      method: 'POST',
      headers: seatCapabilityHeaders(firstBody.token),
      body: JSON.stringify({ matchId: TEST_MATCH_ID, seatId: TEST_SEAT_ID }),
    });
    expect(probeFirst.status).toBe(200);

    const probeSecond = await app.request('/v1/seats/capability/probe', {
      method: 'POST',
      headers: seatCapabilityHeaders(secondBody.token),
      body: JSON.stringify({ matchId: TEST_MATCH_ID, seatId: TEST_SEAT_ID }),
    });
    expect(probeSecond.status).toBe(200);
  });
});

describe('requireSeatCapability gate and probes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    resetSeatScopedProbeCounters();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function mintToken(app: ReturnType<typeof createTestApp>['app']) {
    const response = await mintSeatCapability(app);
    const body = await response.json();
    return body.token as string;
  }

  it('verifies the same token twice before expiry', async () => {
    const { app, stores } = createTestApp();
    const token = await mintToken(app);

    probeSeatScopedViewGet({
      matchId: TEST_MATCH_ID,
      seatId: TEST_SEAT_ID,
      token,
      ledger: stores.seatCapabilityLedger,
    });
    probeSeatScopedViewGet({
      matchId: TEST_MATCH_ID,
      seatId: TEST_SEAT_ID,
      token,
      ledger: stores.seatCapabilityLedger,
    });

    expect(getSeatScopedProbeCounters().viewGet).toBe(2);
  });

  it('calls stub view.get and turn.set only after a successful gate', async () => {
    const { app, stores } = createTestApp();
    const token = await mintToken(app);

    expect(() =>
      probeSeatScopedViewGet({
        matchId: TEST_MATCH_ID,
        seatId: TEST_SEAT_ID,
        token: undefined,
        ledger: stores.seatCapabilityLedger,
      }),
    ).toThrow('missing_capability');
    expect(getSeatScopedProbeCounters().viewGet).toBe(0);

    probeSeatScopedViewGet({
      matchId: TEST_MATCH_ID,
      seatId: TEST_SEAT_ID,
      token,
      ledger: stores.seatCapabilityLedger,
    });
    probeSeatScopedTurnSet({
      matchId: TEST_MATCH_ID,
      seatId: TEST_SEAT_ID,
      token,
      ledger: stores.seatCapabilityLedger,
    });

    expect(getSeatScopedProbeCounters()).toEqual({ viewGet: 1, turnSet: 1 });
  });

  it('rejects expired capabilities', async () => {
    const { app, stores } = createTestApp();
    const token = await mintToken(app);

    vi.advanceTimersByTime(SEAT_CAPABILITY_TTL_SECONDS * 1000);

    expect(() =>
      probeSeatScopedViewGet({
        matchId: TEST_MATCH_ID,
        seatId: TEST_SEAT_ID,
        token,
        ledger: stores.seatCapabilityLedger,
      }),
    ).toThrow('expired_capability');
    expect(getSeatScopedProbeCounters().viewGet).toBe(0);
  });

  it('rejects wrong seat and wrong match', async () => {
    const { app, stores } = createTestApp();
    const token = await mintToken(app);

    expect(() =>
      probeSeatScopedViewGet({
        matchId: TEST_MATCH_ID,
        seatId: 'seat-other',
        token,
        ledger: stores.seatCapabilityLedger,
      }),
    ).toThrow('wrong_seat');

    expect(() =>
      probeSeatScopedViewGet({
        matchId: 'match-other',
        seatId: TEST_SEAT_ID,
        token,
        ledger: stores.seatCapabilityLedger,
      }),
    ).toThrow('wrong_match');
  });

  it('rejects bootstrap tokens presented as seat capabilities', async () => {
    const { app, stores } = createTestApp();

    const bootstrapMint = await app.request('/v1/bootstrap/mint', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ matchId: TEST_MATCH_ID }),
    });
    const bootstrapToken = (await bootstrapMint.json()).token as string;

    expect(() =>
      probeSeatScopedViewGet({
        matchId: TEST_MATCH_ID,
        seatId: TEST_SEAT_ID,
        token: bootstrapToken,
        ledger: stores.seatCapabilityLedger,
      }),
    ).toThrow('invalid_capability');
  });

  it('persists playerSubject on the ledger without accepting client-supplied subject on verify', async () => {
    const { app, stores } = createTestApp();
    const token = await mintToken(app);

    const verified = probeSeatScopedViewGet({
      matchId: TEST_MATCH_ID,
      seatId: TEST_SEAT_ID,
      token,
      ledger: stores.seatCapabilityLedger,
    });

    expect(verified.jti).toBeTruthy();
    expect(stores.seatCapabilityLedger.get(token)?.playerSubject).toBe(TEST_PLAYER_SUBJECT);
  });
});

describe('POST /v1/seats/capability/probe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function mintToken(app: ReturnType<typeof createTestApp>['app']) {
    const response = await mintSeatCapability(app);
    return (await response.json()).token as string;
  }

  it('accepts a valid seat capability header', async () => {
    const { app } = createTestApp();
    const token = await mintToken(app);

    const response = await app.request('/v1/seats/capability/probe', {
      method: 'POST',
      headers: seatCapabilityHeaders(token),
      body: JSON.stringify({ matchId: TEST_MATCH_ID, seatId: TEST_SEAT_ID }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true, jti: expect.any(String) });
    expect(body.playerSubject).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(token);
  });

  it('rejects missing, invalid, expired, wrong-seat, and wrong-match capabilities', async () => {
    const { app } = createTestApp();
    const token = await mintToken(app);

    const missing = await app.request('/v1/seats/capability/probe', {
      method: 'POST',
      headers: seatCapabilityHeaders(),
      body: JSON.stringify({ matchId: TEST_MATCH_ID, seatId: TEST_SEAT_ID }),
    });
    expect(missing.status).toBe(403);
    expect((await missing.json()).error).toBe('missing_capability');

    const invalid = await app.request('/v1/seats/capability/probe', {
      method: 'POST',
      headers: seatCapabilityHeaders('not-valid-hex'),
      body: JSON.stringify({ matchId: TEST_MATCH_ID, seatId: TEST_SEAT_ID }),
    });
    expect(invalid.status).toBe(403);
    expect((await invalid.json()).error).toBe('invalid_capability');

    vi.advanceTimersByTime(SEAT_CAPABILITY_TTL_SECONDS * 1000 + 1);
    const expired = await app.request('/v1/seats/capability/probe', {
      method: 'POST',
      headers: seatCapabilityHeaders(token),
      body: JSON.stringify({ matchId: TEST_MATCH_ID, seatId: TEST_SEAT_ID }),
    });
    expect(expired.status).toBe(403);
    expect((await expired.json()).error).toBe('expired_capability');

    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const freshToken = await mintToken(app);

    const wrongSeat = await app.request('/v1/seats/capability/probe', {
      method: 'POST',
      headers: seatCapabilityHeaders(freshToken),
      body: JSON.stringify({ matchId: TEST_MATCH_ID, seatId: 'seat-other' }),
    });
    expect(wrongSeat.status).toBe(403);
    expect((await wrongSeat.json()).error).toBe('wrong_seat');

    const wrongMatch = await app.request('/v1/seats/capability/probe', {
      method: 'POST',
      headers: seatCapabilityHeaders(freshToken),
      body: JSON.stringify({ matchId: 'match-other', seatId: TEST_SEAT_ID }),
    });
    expect(wrongMatch.status).toBe(403);
    expect((await wrongMatch.json()).error).toBe('wrong_match');
  });

  it('rejects postMessage-shaped JSON without the seat-capability header', async () => {
    const { app } = createTestApp();

    const response = await app.request('/v1/seats/capability/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'seat-claim',
        seatId: TEST_SEAT_ID,
        matchId: TEST_MATCH_ID,
      }),
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('missing_capability');
  });

  it('rejects cookie-only play session without seat capability header', async () => {
    const { app, stores } = createTestApp();
    const sessionId = stores.playSessionStore.create(TEST_MATCH_ID);

    const response = await app.request('/v1/seats/capability/probe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: buildPlaySessionCookie(sessionId),
      },
      body: JSON.stringify({ matchId: TEST_MATCH_ID, seatId: TEST_SEAT_ID }),
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('missing_capability');
  });

  it('rejects when attached play session match differs from probe match', async () => {
    const { app, stores } = createTestApp();
    const token = await mintToken(app);
    const sessionId = stores.playSessionStore.create('other-match');

    const response = await app.request('/v1/seats/capability/probe', {
      method: 'POST',
      headers: {
        ...seatCapabilityHeaders(token),
        Cookie: buildPlaySessionCookie(sessionId),
      },
      body: JSON.stringify({ matchId: TEST_MATCH_ID, seatId: TEST_SEAT_ID }),
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('wrong_match');
  });

  it('does not echo raw token or host key in error responses', async () => {
    const { app } = createTestApp();
    const token = await mintToken(app);

    const response = await app.request('/v1/seats/capability/probe', {
      method: 'POST',
      headers: seatCapabilityHeaders(token),
      body: JSON.stringify({ matchId: 'match-other', seatId: TEST_SEAT_ID }),
    });

    const text = await response.text();
    expect(text).not.toContain(token);
    expect(text).not.toContain(TEST_HOST_API_KEY);
  });
});

describe('bootstrap routes remain independent of seat capability', () => {
  it('still mints and redeems bootstrap without a seat capability', async () => {
    const { app } = createTestApp();

    const mint = await app.request('/v1/bootstrap/mint', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ matchId: TEST_MATCH_ID }),
    });
    expect(mint.status).toBe(200);
    const token = (await mint.json()).token as string;

    const redeem = await app.request('/v1/bootstrap/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    expect(redeem.status).toBe(200);
  });
});

describe('seat capability ledger storage', () => {
  it('stores SHA-256 hashes only', () => {
    const ledger = new SeatCapabilityLedger();
    const token = 'a'.repeat(64);

    ledger.put(token, {
      jti: 'jti-1',
      matchId: TEST_MATCH_ID,
      seatId: TEST_SEAT_ID,
      playerSubject: TEST_PLAYER_SUBJECT,
      iat: 1,
      exp: 2,
      purpose: 'seat',
    });

    expect(ledger.get(token)?.purpose).toBe('seat');
    expect(ledger.get('b'.repeat(64))).toBeUndefined();
  });
});
