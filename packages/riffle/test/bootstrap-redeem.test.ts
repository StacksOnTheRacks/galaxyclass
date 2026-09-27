import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOTSTRAP_TTL_SECONDS } from '../src/server/bootstrap/token.js';
import { TEST_MATCH_ID } from './helpers/fixtures.js';
import { authHeaders, createTestApp } from './helpers/test-app.js';

describe('POST /v1/bootstrap/redeem', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function mintToken(app: ReturnType<typeof createTestApp>['app']) {
    const mint = await app.request('/v1/bootstrap/mint', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ matchId: TEST_MATCH_ID }),
    });
    const body = await mint.json();
    return body.token as string;
  }

  it('redeems a valid token and sets riffle_play cookie', async () => {
    const { app } = createTestApp();
    const token = await mintToken(app);

    const response = await app.request('/v1/bootstrap/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ matchId: TEST_MATCH_ID, bound: true });
    expect(body.seatId).toBeUndefined();

    const setCookie = response.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toContain('riffle_play=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Max-Age=3600');
  });

  it('rejects missing token', async () => {
    const { app } = createTestApp();

    const response = await app.request('/v1/bootstrap/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('missing_token');
  });

  it('rejects expired token', async () => {
    const { app } = createTestApp();
    const token = await mintToken(app);

    vi.advanceTimersByTime(BOOTSTRAP_TTL_SECONDS * 1000 + 1);

    const response = await app.request('/v1/bootstrap/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('expired_token');
  });

  it('rejects already-used token on second redeem', async () => {
    const { app } = createTestApp();
    const token = await mintToken(app);

    const first = await app.request('/v1/bootstrap/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    expect(first.status).toBe(200);

    const second = await app.request('/v1/bootstrap/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    expect(second.status).toBe(403);
    expect((await second.json()).error).toBe('already_used');
  });

  it('rejects invalid token', async () => {
    const { app } = createTestApp();

    const response = await app.request('/v1/bootstrap/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'not-a-real-token' }),
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('invalid_token');
  });
});
