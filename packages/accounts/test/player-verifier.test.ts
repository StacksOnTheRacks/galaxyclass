import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPlayerResolver,
  createProfileLookup,
  playerResolverFromEnv,
  resolveSitIdentity,
} from '../src/player-verifier.js';
import { accessClaims, attackerKey, signJwt, testAccessTokenVerifier } from './support/cognito-tokens.js';

const profile = async () => ({ gamerTag: 'WordSmith', avatarId: 4 });

describe('player verifier', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('resolves a pool-signed access token to the studio profile', async () => {
    const resolve = createPlayerResolver(testAccessTokenVerifier(), profile);
    await expect(resolve(signJwt(accessClaims()))).resolves.toEqual({
      sub: 'sub-word-smith',
      gamerTag: 'WordSmith',
      avatarId: 4,
    });
  });

  it('rejects forged, expired, and id tokens', async () => {
    const resolve = createPlayerResolver(testAccessTokenVerifier(), profile);
    await expect(resolve(signJwt(accessClaims(), attackerKey))).resolves.toBeNull();
    await expect(resolve(signJwt(accessClaims({ exp: 1 })))).resolves.toBeNull();
    await expect(resolve(signJwt(accessClaims({ token_use: 'id' })))).resolves.toBeNull();
  });

  it('tags log lines with the calling game', async () => {
    const warn = vi.mocked(console.warn);
    const resolve = createPlayerResolver(testAccessTokenVerifier(), profile, { logTag: 'scribble' });
    await resolve('not-a-jwt');
    expect(warn.mock.calls[0]?.[0]).toBe('[scribble] access token rejected');
  });

  it('reads gamer tag and avatar from the profile table, dropping invalid values', async () => {
    const send = vi.fn().mockResolvedValue({ Item: { gamerTag: 'x', avatarId: 9999 } });
    const lookup = createProfileLookup({ send }, 'profiles');
    await expect(lookup('abc')).resolves.toEqual({ gamerTag: null, avatarId: null });
    expect(send.mock.calls[0]?.[0].input.Key).toEqual({ pk: 'USER#abc' });
  });

  it('is unconfigured without the full env', () => {
    expect(playerResolverFromEnv({ userPoolId: 'p' }, { send: vi.fn() })).toBeNull();
  });
});

describe('resolveSitIdentity', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const resolve = createPlayerResolver(testAccessTokenVerifier(), profile);

  it('treats a missing token as a guest', async () => {
    await expect(resolveSitIdentity(undefined, resolve)).resolves.toEqual({ ok: true, player: null });
  });

  it('never turns a bad token into a guest sit', async () => {
    await expect(resolveSitIdentity('garbage', resolve)).resolves.toEqual({
      ok: false,
      code: 'invalid_access_token',
    });
    await expect(resolveSitIdentity(42, resolve)).resolves.toEqual({
      ok: false,
      code: 'invalid_access_token',
    });
    await expect(resolveSitIdentity(signJwt(accessClaims()), null)).resolves.toEqual({
      ok: false,
      code: 'invalid_access_token',
    });
  });

  it('reports identity_unavailable when the profile lookup throws', async () => {
    const failing = createPlayerResolver(testAccessTokenVerifier(), async () => {
      throw new Error('dynamo down');
    });
    await expect(resolveSitIdentity(signJwt(accessClaims()), failing)).resolves.toEqual({
      ok: false,
      code: 'identity_unavailable',
    });
  });

  it('returns the verified player', async () => {
    const result = await resolveSitIdentity(signJwt(accessClaims()), resolve);
    expect(result).toEqual({
      ok: true,
      player: { sub: 'sub-word-smith', gamerTag: 'WordSmith', avatarId: 4 },
    });
  });
});
