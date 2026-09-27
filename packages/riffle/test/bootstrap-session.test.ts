import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_MATCH_ID } from './helpers/fixtures.js';
import { authHeaders, createTestApp } from './helpers/test-app.js';

describe('GET /v1/bootstrap/session', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('returns session on reload without a second mint', async () => {
    const { app } = createTestApp();

    const mint = await app.request('/v1/bootstrap/mint', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ matchId: TEST_MATCH_ID }),
    });
    const { token } = await mint.json();

    const redeem = await app.request('/v1/bootstrap/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const cookie = redeem.headers.get('Set-Cookie') ?? '';

    const session = await app.request('/v1/bootstrap/session', {
      headers: { Cookie: cookie.split(';')[0] ?? '' },
    });

    expect(session.status).toBe(200);
    const body = await session.json();
    expect(body).toEqual({ matchId: TEST_MATCH_ID, bound: true });
    expect(body.seatId).toBeUndefined();
  });

  it('returns invalid_session without cookie', async () => {
    const { app } = createTestApp();

    const response = await app.request('/v1/bootstrap/session');
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('invalid_session');
  });
});
