import { describe, expect, it } from 'vitest';
import { ACCOUNT_HINT_KEY, parseAccountHint, serializeAccountHint } from '../src/account-hint.js';
import {
  AVATAR_COUNT,
  AVATAR_IDS,
  GALAXY_CLASS_ORIGIN,
  avatarIdForSeed,
  avatarUrl,
  isAvatarId,
  randomAvatarId,
} from '../src/avatars.js';

describe('avatars', () => {
  it('lists every avatar id once', () => {
    expect(AVATAR_IDS).toHaveLength(AVATAR_COUNT);
    expect(new Set(AVATAR_IDS).size).toBe(AVATAR_COUNT);
    expect(AVATAR_IDS[0]).toBe(1);
    expect(AVATAR_IDS.at(-1)).toBe(AVATAR_COUNT);
  });

  it('validates ids strictly', () => {
    expect(isAvatarId(1)).toBe(true);
    expect(isAvatarId(AVATAR_COUNT)).toBe(true);
    for (const bad of [0, AVATAR_COUNT + 1, 1.5, '3', null, undefined, Number.NaN]) {
      expect(isAvatarId(bad)).toBe(false);
    }
  });

  it('builds site-relative or absolute urls', () => {
    expect(avatarUrl(7)).toBe('/avatars/7.webp');
    expect(avatarUrl(7, GALAXY_CLASS_ORIGIN)).toBe('https://galaxyclass.app/avatars/7.webp');
    expect(avatarUrl(7, 'https://galaxyclass.app/')).toBe('https://galaxyclass.app/avatars/7.webp');
    expect(avatarUrl(999)).toBe('/avatars/1.webp');
  });

  it('picks random ids across the whole library', () => {
    expect(randomAvatarId(() => 0)).toBe(1);
    expect(randomAvatarId(() => 0.999999)).toBe(AVATAR_COUNT);
    expect(isAvatarId(randomAvatarId())).toBe(true);
  });

  it('derives a stable id from a seed', () => {
    expect(avatarIdForSeed('table:1:Lucky Otter')).toBe(avatarIdForSeed('table:1:Lucky Otter'));
    expect(isAvatarId(avatarIdForSeed('anything'))).toBe(true);
  });
});

describe('account hint', () => {
  it('uses the key games already read', () => {
    expect(ACCOUNT_HINT_KEY).toBe('galaxyclass.account');
  });

  it('round-trips the public profile and never includes email', () => {
    const raw = serializeAccountHint({ gamerTag: 'RiverRat', avatarId: 12 });
    expect(raw).not.toContain('@');
    expect(parseAccountHint(raw)).toEqual({ signedIn: true, gamerTag: 'RiverRat', avatarId: 12 });
  });

  it('treats legacy email-only hints as signed in without exposing the email', () => {
    expect(parseAccountHint(JSON.stringify({ email: 'maya@example.com' }))).toEqual({
      signedIn: true,
      gamerTag: null,
      avatarId: null,
    });
  });

  it('drops invalid profile fields and rejects unknown shapes', () => {
    expect(
      parseAccountHint(JSON.stringify({ signedIn: true, gamerTag: 'bad tag!', avatarId: 9000 })),
    ).toEqual({ signedIn: true, gamerTag: null, avatarId: null });
    expect(parseAccountHint(null)).toBeNull();
    expect(parseAccountHint('{"email":')).toBeNull();
    expect(parseAccountHint('{}')).toBeNull();
    expect(parseAccountHint('"text"')).toBeNull();
  });
});
