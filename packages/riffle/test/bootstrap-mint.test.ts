import { describe, expect, it } from 'vitest';
import {
  TEST_HOST_API_KEY,
  TEST_MATCH_ID,
  TEST_PUBLIC_ORIGIN,
} from './helpers/fixtures.js';
import { authHeaders, createTestApp } from './helpers/test-app.js';

describe('POST /v1/bootstrap/mint', () => {
  it('mints a bootstrap token with fixture host API key', async () => {
    const { app } = createTestApp();

    const response = await app.request('/v1/bootstrap/mint', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ matchId: TEST_MATCH_ID }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.matchId).toBeUndefined();
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);
    expect(body.expiresIn).toBe(60);
    expect(typeof body.jti).toBe('string');
    expect(body.jti.length).toBeGreaterThan(0);
  });

  it('rejects unauthenticated mint requests', async () => {
    const { app } = createTestApp();

    const response = await app.request('/v1/bootstrap/mint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchId: TEST_MATCH_ID }),
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('unauthorized');
  });

  it('returns playUrl with fragment-only bootstrap token', async () => {
    const { app } = createTestApp();

    const response = await app.request('/v1/bootstrap/mint', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ matchId: TEST_MATCH_ID }),
    });

    const body = await response.json();
    expect(body.playUrl).toMatch(
      new RegExp(`^${TEST_PUBLIC_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/play#bt=`),
    );
    expect(body.playUrl).not.toContain('?');
    expect(body.playUrl).not.toContain(`token=${body.token}`);
  });

  it('returns invalid_match_id for empty or oversized matchId', async () => {
    const { app } = createTestApp();

    const empty = await app.request('/v1/bootstrap/mint', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ matchId: '   ' }),
    });
    expect(empty.status).toBe(400);
    expect((await empty.json()).error).toBe('invalid_match_id');

    const oversized = await app.request('/v1/bootstrap/mint', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ matchId: 'x'.repeat(129) }),
    });
    expect(oversized.status).toBe(400);
    expect((await oversized.json()).error).toBe('invalid_match_id');
  });

  it('rejects wrong bearer token', async () => {
    const { app } = createTestApp();

    const response = await app.request('/v1/bootstrap/mint', {
      method: 'POST',
      headers: authHeaders('wrong-key'),
      body: JSON.stringify({ matchId: TEST_MATCH_ID }),
    });

    expect(response.status).toBe(401);
  });
});

describe('GET /play', () => {
  it('serves play shell with security headers', async () => {
    const { app } = createTestApp();

    const response = await app.request('/play');

    expect(response.status).toBe(200);
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'self'");
    expect(await response.text()).toContain('id="app"');
  });
});
