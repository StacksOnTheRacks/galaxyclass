import { describe, expect, it } from 'vitest';
import { createIdentityStore } from '../../src/identity/store.js';
import { createTestApp } from '../helpers/test-app.js';
import { TEST_HOST_API_KEY } from '../helpers/fixtures.js';

describe('identity routes', () => {
  it('issues bearer-only sessions without Set-Cookie', async () => {
    const identityStore = createIdentityStore();
    const { app } = createTestApp({ stores: { identityStore } });

    const signUp = await app.request('/v1/identity/sign-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'player@example.com', password: 'password123' }),
    });

    expect(signUp.status).toBe(201);
    expect(signUp.headers.get('Set-Cookie')).toBeNull();
    const body = (await signUp.json()) as { bearer: string; playerSubject: string };
    expect(body.bearer).toBeTruthy();

    const session = await app.request('/v1/identity/session', {
      headers: { Authorization: `Bearer ${body.bearer}` },
    });
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({
      kind: 'account',
      playerSubject: body.playerSubject,
      email: 'player@example.com',
    });
  });

  it('cookie-only session GET is unauthenticated', async () => {
    const { app } = createTestApp();
    const response = await app.request('/v1/identity/session', {
      headers: { Cookie: 'riffle_play=sess' },
    });
    expect(response.status).toBe(401);
  });

  it('rejects host API key and JWT-shaped Authorization tokens', async () => {
    const { app } = createTestApp();
    const hostKey = await app.request('/v1/identity/session', {
      headers: { Authorization: `Bearer ${TEST_HOST_API_KEY}` },
    });
    expect(hostKey.status).toBe(401);

    const jwt = await app.request('/v1/identity/session', {
      headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.sig' },
    });
    expect(jwt.status).toBe(401);
  });

  it('anonymous issue returns anon playerSubject', async () => {
    const { app } = createTestApp();
    const response = await app.request('/v1/identity/anonymous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('Set-Cookie')).toBeNull();
    const body = (await response.json()) as { bearer: string; playerSubject: string };
    expect(body.playerSubject).toMatch(/^anon:[A-Za-z0-9_-]+$/);
  });

  it('sign-out deletes the session bearer', async () => {
    const identityStore = createIdentityStore();
    const { app } = createTestApp({ stores: { identityStore } });
    const issued = identityStore.issueAnonymous();

    const signOut = await app.request('/v1/identity/sign-out', {
      method: 'POST',
      headers: { Authorization: `Bearer ${issued.bearer}` },
    });
    expect(signOut.status).toBe(204);

    const session = await app.request('/v1/identity/session', {
      headers: { Authorization: `Bearer ${issued.bearer}` },
    });
    expect(session.status).toBe(401);
  });

  it('does not put bearer tokens in page Location headers', async () => {
    const { app } = createTestApp();
    for (const path of ['/', '/sign-in', '/sign-up']) {
      const response = await app.request(path);
      expect(response.status).toBe(200);
      const location = response.headers.get('Location') ?? '';
      expect(location).not.toMatch(/Bearer|token=|bearer=/i);
    }
  });
});
