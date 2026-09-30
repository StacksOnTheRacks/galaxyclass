import { beforeEach, describe, expect, it } from 'vitest';
import { isAvatarId } from '../src/avatars.js';
import {
  PENDING_TAG_TTL_SECONDS,
  createProfileStore,
  pendingPk,
  tagPk,
  userPk,
  type ProfileStore,
} from '../src/profile-store.js';
import { MemoryDynamo } from './support/memory-dynamo.js';

const START = new Date('2026-09-01T00:00:00Z');

describe('profile store', () => {
  let db: MemoryDynamo;
  let clock: Date;
  let store: ProfileStore;

  beforeEach(() => {
    db = new MemoryDynamo();
    clock = START;
    store = createProfileStore({ client: db, tableName: 'profiles', now: () => clock, random: () => 0.5 });
  });

  it('creates a profile with a random avatar and no gamer tag for existing accounts', async () => {
    const profile = await store.getProfile('sub-1');
    expect(profile.gamerTag).toBeNull();
    expect(isAvatarId(profile.avatarId)).toBe(true);
    expect(await store.getProfile('sub-1')).toEqual(profile);
  });

  it('claims a free gamer tag and records the lock', async () => {
    const result = await store.setGamerTag('sub-1', 'RiverRat');
    expect(result).toEqual({ ok: true, profile: expect.objectContaining({ gamerTag: 'RiverRat' }) });
    expect(db.items.get(tagPk('riverrat'))).toMatchObject({ ownerSub: 'sub-1', status: 'claimed' });
    expect(db.items.get(userPk('sub-1'))).toMatchObject({ gamerTag: 'RiverRat' });
  });

  it('rejects a tag another player holds, ignoring case', async () => {
    await store.setGamerTag('sub-1', 'RiverRat');
    expect(await store.setGamerTag('sub-2', 'riverrat')).toEqual({ ok: false, reason: 'taken' });
    expect(await store.isGamerTagAvailable('RIVERRAT')).toBe(false);
    expect(await store.isGamerTagAvailable('RiverRat', 'sub-1')).toBe(true);
    expect((await store.getProfile('sub-2')).gamerTag).toBeNull();
  });

  it('releases the old tag when a player changes theirs', async () => {
    await store.setGamerTag('sub-1', 'RiverRat');
    await store.setGamerTag('sub-1', 'FlopHouse');
    expect(db.items.has(tagPk('riverrat'))).toBe(false);
    expect(await store.isGamerTagAvailable('RiverRat')).toBe(true);
    expect(await store.setGamerTag('sub-2', 'RiverRat')).toMatchObject({ ok: true });
  });

  it('lets a player change only the casing of their own tag', async () => {
    await store.setGamerTag('sub-1', 'riverrat');
    expect(await store.setGamerTag('sub-1', 'RiverRat')).toMatchObject({
      ok: true,
      profile: { gamerTag: 'RiverRat' },
    });
    expect(db.items.get(tagPk('riverrat'))).toMatchObject({ gamerTag: 'RiverRat', ownerSub: 'sub-1' });
  });

  it('only one of two concurrent claims for the same tag wins', async () => {
    const results = await Promise.all([
      store.setGamerTag('sub-1', 'Photon'),
      store.setGamerTag('sub-2', 'photon'),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, reason: 'taken' }]);
  });

  it('persists avatar choices', async () => {
    expect((await store.setAvatar('sub-1', 42)).avatarId).toBe(42);
    expect((await store.getProfile('sub-1')).avatarId).toBe(42);
  });

  describe('sign-up reservations', () => {
    it('reserves at sign-up and claims on confirmation', async () => {
      expect(await store.reservePendingGamerTag('New@Example.com', 'NovaStar')).toBe('reserved');
      expect(await store.isGamerTagAvailable('novastar')).toBe(false);
      expect(await store.setGamerTag('sub-other', 'NovaStar')).toEqual({ ok: false, reason: 'taken' });

      const profile = await store.claimPendingGamerTag('sub-new', 'new@example.com');
      expect(profile.gamerTag).toBe('NovaStar');
      expect(isAvatarId(profile.avatarId)).toBe(true);
      expect(db.items.get(tagPk('novastar'))).toMatchObject({ status: 'claimed', ownerSub: 'sub-new' });
      expect(db.items.has(pendingPk('new@example.com'))).toBe(false);
    });

    it('blocks a second sign-up for a pending tag but lets the same email retry', async () => {
      await store.reservePendingGamerTag('a@example.com', 'NovaStar');
      expect(await store.reservePendingGamerTag('b@example.com', 'novastar')).toBe('taken');
      expect(await store.reservePendingGamerTag('A@example.com', 'NovaStar')).toBe('reserved');
    });

    it('frees abandoned reservations once they expire', async () => {
      await store.reservePendingGamerTag('a@example.com', 'NovaStar');
      clock = new Date(START.getTime() + (PENDING_TAG_TTL_SECONDS + 1) * 1000);
      expect(await store.isGamerTagAvailable('NovaStar')).toBe(true);
      expect(await store.reservePendingGamerTag('b@example.com', 'NovaStar')).toBe('reserved');
    });

    it('confirms without a tag when the reservation was lost', async () => {
      await store.reservePendingGamerTag('a@example.com', 'NovaStar');
      clock = new Date(START.getTime() + (PENDING_TAG_TTL_SECONDS + 1) * 1000);
      await store.setGamerTag('sub-fast', 'NovaStar');

      const profile = await store.claimPendingGamerTag('sub-slow', 'a@example.com');
      expect(profile.gamerTag).toBeNull();
      expect(db.items.get(tagPk('novastar'))).toMatchObject({ ownerSub: 'sub-fast' });
      expect(db.items.has(pendingPk('a@example.com'))).toBe(false);
    });

    it('confirms accounts that signed up before gamer tags existed', async () => {
      expect((await store.claimPendingGamerTag('sub-legacy', 'old@example.com')).gamerTag).toBeNull();
    });
  });
});
