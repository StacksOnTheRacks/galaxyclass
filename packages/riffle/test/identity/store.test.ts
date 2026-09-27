import { describe, expect, it } from 'vitest';
import { createIdentityStore } from '../../src/identity/store.js';

describe('IdentityStore', () => {
  it('sign-up issues account bearer with opaque playerSubject', async () => {
    const store = createIdentityStore();
    const result = await store.signUp('player@example.com', 'password123');
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.playerSubject).toMatch(/^acct_/);
    expect(result.value.playerSubject).not.toBe('player@example.com');
    expect(result.value.bearer).not.toBe(result.value.playerSubject);

    const session = store.getSession(result.value.bearer);
    expect(session?.kind).toBe('account');
    expect(session?.email).toBe('player@example.com');
  });

  it('sign-in returns the same playerSubject for an account', async () => {
    const store = createIdentityStore();
    const created = await store.signUp('player@example.com', 'password123');
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const signedIn = await store.signIn('player@example.com', 'password123');
    expect(signedIn.ok).toBe(true);
    if (!signedIn.ok) {
      return;
    }

    expect(signedIn.value.playerSubject).toBe(created.value.playerSubject);
  });

  it('anonymous issue returns anon:{jti} distinct from bearer', () => {
    const store = createIdentityStore();
    const first = store.issueAnonymous();
    const second = store.issueAnonymous();

    expect(first.playerSubject).toMatch(/^anon:[A-Za-z0-9_-]+$/);
    expect(first.bearer).not.toBe(first.playerSubject);
    expect(first.bearer).not.toBe(second.bearer);
    expect(first.playerSubject).not.toBe(second.playerSubject);
  });

  it('returns the same 401 for unknown account and bad password', async () => {
    const store = createIdentityStore();
    await store.signUp('player@example.com', 'password123');

    const unknown = await store.signIn('missing@example.com', 'password123');
    const badPassword = await store.signIn('player@example.com', 'wrong-password');

    expect(unknown.ok).toBe(false);
    expect(badPassword.ok).toBe(false);
    if (unknown.ok || badPassword.ok) {
      return;
    }

    expect(unknown.status).toBe(401);
    expect(badPassword.status).toBe(401);
    expect(unknown.body).toEqual(badPassword.body);
  });

  it('rejects duplicate email on sign-up', async () => {
    const store = createIdentityStore();
    await store.signUp('player@example.com', 'password123');
    const duplicate = await store.signUp('player@example.com', 'another-password');
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) {
      return;
    }
    expect(duplicate.status).toBe(409);
  });
});
