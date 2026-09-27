// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearStoredSession,
  IDENTITY_SESSION_KEY,
  readStoredSession,
  writeStoredSession,
} from '../../src/client/identity/session.js';

describe('identity session client', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    document.cookie = 'riffle_play=test; path=/';
  });

  it('stores bearer session only in sessionStorage', () => {
    writeStoredSession({ bearer: 'opaque-bearer', playerSubject: 'acct_abc123' });

    expect(sessionStorage.getItem(IDENTITY_SESSION_KEY)).toContain('opaque-bearer');
    expect(localStorage.length).toBe(0);
    expect(document.cookie).not.toContain('opaque-bearer');
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
  });

  it('clears stored session on sign-out helper', () => {
    writeStoredSession({ bearer: 'opaque-bearer', playerSubject: 'anon:jti123' });
    clearStoredSession();
    expect(readStoredSession()).toBeUndefined();
  });
});
