import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newTableRecord } from '../../src/runtime/table-record.js';
import { attackerKey, signAccessToken } from '../support/cognito-tokens.js';
import { Harness, TABLE_ID } from '../support/runtime-harness.js';

let h: Harness;
beforeEach(async () => {
  h = new Harness();
  await h.seed();
});
afterEach(() => vi.restoreAllMocks());

describe('table session', () => {
  it('rejects public create_table', async () => {
    await h.connect('c1');
    await h.send('c1', { action: 'create_table', name: 'mine' });
    expect(h.lastError('c1')).toEqual({ type: 'error', code: 'unsupported_action' });
    expect(h.store.tables.size).toBe(1);
  });

  it('answers an unknown table id with table_not_found', async () => {
    await h.connect('c1');
    await h.send('c1', { action: 'join_table', tableId: '00000000-0000-4000-8000-000000000000' });
    expect(h.lastError('c1')).toEqual({ type: 'error', code: 'table_not_found' });
    expect(h.store.connections.get('c1')?.tableId).toBeUndefined();
  });

  it('requires join_table before anything else', async () => {
    await h.connect('c1');
    await h.send('c1', { action: 'sit' });
    expect(h.lastError('c1')).toEqual({ type: 'error', code: 'not_table_member' });
  });

  it('refuses malformed and unknown messages', async () => {
    await h.connect('c1');
    await h.send('c1', 'not json');
    await h.send('c1', { nope: true });
    expect(h.messages('c1')).toEqual([
      { type: 'error', code: 'unsupported_action' },
      { type: 'error', code: 'unsupported_action' },
    ]);
  });

  it('sends a snapshot on join with no open-ended listing', async () => {
    await h.connect('c1');
    await h.send('c1', { action: 'join_table', tableId: TABLE_ID });
    const snapshot = h.snapshot('c1');
    expect(snapshot).toMatchObject({ tableId: TABLE_ID, status: 'waiting', themeId: 'default', maxSeats: 4, you: null });
    expect(snapshot.seats.map((s) => s.occupied)).toEqual([false, false, false, false]);
  });

  it('lists occupancy only for the ids asked for', async () => {
    await h.seat('a');
    await h.connect('lobby');
    await h.send('lobby', { action: 'list_tables', tableIds: [TABLE_ID, 'missing'] });
    expect(h.last('lobby', 'table_list').tables).toEqual([
      { tableId: TABLE_ID, seatedCount: 1, maxSeats: 4, status: 'waiting' },
    ]);
    await h.send('lobby', { action: 'list_tables' });
    expect(h.last('lobby', 'table_list').tables).toEqual([]);
  });
});

describe('sit', () => {
  it('seats a guest under a server-chosen name and ignores a client-sent one', async () => {
    await h.seat('a', { displayName: 'WordSmith', avatarId: 3 });
    const seat = h.snapshot('a').seats[0]!;
    expect(seat.displayName).not.toBe('WordSmith');
    expect(seat.displayName).toContain(' ');
    expect(seat.signedIn).toBe(false);
    expect(h.snapshot('a').you).toEqual({ seatId: '1', rack: [] });
  });

  it('seats a verified account under its studio gamer tag and avatar', async () => {
    await h.seat('a', { accessToken: signAccessToken(), displayName: 'Impostor' });
    expect(h.snapshot('a').seats[0]).toMatchObject({ displayName: 'WordSmith', avatarId: 12, signedIn: true });
  });

  it('never turns a bad access token into a guest', async () => {
    await h.connect('a');
    await h.send('a', { action: 'join_table', tableId: TABLE_ID });
    await h.send('a', { action: 'sit', accessToken: signAccessToken({}, attackerKey) });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'invalid_access_token' });
    await h.send('a', { action: 'sit', accessToken: '' });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'invalid_access_token' });
    expect(h.store.seats.get(TABLE_ID)!.size).toBe(0);
  });

  it('enforces one seat per connection and per account, and open seats only', async () => {
    await h.seat('a', { accessToken: signAccessToken(), seatId: '2' });
    await h.send('a', { action: 'sit' });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'already_seated' });

    await h.connect('b');
    await h.send('b', { action: 'join_table', tableId: TABLE_ID });
    await h.send('b', { action: 'sit', accessToken: signAccessToken() });
    expect(h.lastError('b')).toEqual({ type: 'error', code: 'account_already_seated' });
    await h.send('b', { action: 'sit', seatId: '2' });
    expect(h.lastError('b')).toEqual({ type: 'error', code: 'seat_occupied' });
    await h.send('b', { action: 'sit', seatId: '5' });
    expect(h.lastError('b')).toEqual({ type: 'error', code: 'invalid_seat' });
    await h.send('b', { action: 'sit' });
    expect(h.last('b', 'sat').seatId).toBe('1');
  });

  it('fills to four and then reports table_full', async () => {
    for (const id of ['a', 'b', 'c', 'd']) {
      await h.seat(id);
    }
    await h.connect('e');
    await h.send('e', { action: 'join_table', tableId: TABLE_ID });
    await h.send('e', { action: 'sit' });
    expect(h.lastError('e')).toEqual({ type: 'error', code: 'table_full' });
  });

  it('stores only the hash of the seat token', async () => {
    const token = await h.seat('a');
    const stored = h.store.seats.get(TABLE_ID)!.get('1')!;
    expect(JSON.stringify(stored)).not.toContain(token);
  });
});

describe('seat token', () => {
  it('rejects a missing, wrong, or stolen seat token', async () => {
    const tokenA = await h.seat('a');
    const tokenB = await h.seat('b');
    await h.send('a', { action: 'start_game', seatToken: tokenA });
    const before = h.store.tables.get(TABLE_ID)!.version;

    await h.send('a', { action: 'pass' });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'invalid_seat_token' });
    await h.send('a', { action: 'pass', seatToken: 'not-a-real-token' });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'invalid_seat_token' });
    await h.send('a', { action: 'pass', seatToken: tokenB });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'not_seated' });
    await h.send('a', { action: 'leave', seatToken: tokenB });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'not_seated' });

    expect(h.store.tables.get(TABLE_ID)!.version).toBe(before);
    expect(h.store.seats.get(TABLE_ID)!.size).toBe(2);
  });

  it('is useless from a connection that has not joined the table', async () => {
    const token = await h.seat('a');
    await h.connect('thief');
    await h.send('thief', { action: 'leave', seatToken: token });
    expect(h.lastError('thief')).toEqual({ type: 'error', code: 'not_table_member' });
    await h.send('thief', { action: 'join_table', tableId: TABLE_ID });
    await h.send('thief', { action: 'leave', seatToken: token });
    expect(h.lastError('thief')).toEqual({ type: 'error', code: 'not_seated' });
  });
});

describe('client-supplied state', () => {
  it('is rejected on every action', async () => {
    const token = await h.seat('a');
    for (const extra of [{ board: [] }, { rack: ['A'] }, { scores: { 1: 99 } }, { bag: [] }, { score: 400 }]) {
      await h.send('a', { action: 'pass', seatToken: token, ...extra });
      expect(h.lastError('a')).toEqual({ type: 'error', code: 'client_supplied_state' });
    }
    await h.send('a', { action: 'sit', racks: {} });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'client_supplied_state' });
  });
});

describe('themes', () => {
  it('lets a seated player change the whole table’s theme', async () => {
    const token = await h.seat('a');
    await h.connect('watcher');
    await h.send('watcher', { action: 'join_table', tableId: TABLE_ID });
    await h.send('a', { action: 'set_theme', seatToken: token, themeId: 'halloween' });
    expect(h.snapshot('a').themeId).toBe('halloween');
    expect(h.snapshot('watcher').themeId).toBe('halloween');
  });

  it('refuses unknown themes and unseated callers', async () => {
    const token = await h.seat('a');
    await h.send('a', { action: 'set_theme', seatToken: token, themeId: 'neon' });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'invalid_theme' });
    await h.connect('watcher');
    await h.send('watcher', { action: 'join_table', tableId: TABLE_ID });
    await h.send('watcher', { action: 'set_theme', themeId: 'christmas' });
    expect(h.lastError('watcher')).toEqual({ type: 'error', code: 'invalid_seat_token' });
  });
});

describe('private invite-only tables', () => {
  it('use the same join, sit, and leave with no listing', async () => {
    const privateId = '0b7c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d';
    await h.store.putTable(
      newTableRecord({ tableId: privateId, createdAt: '2026-10-04T00:00:00.000Z', visibility: 'private', createdBy: 'sub-word-smith' }),
    );
    const token = await h.seat('a', {}, privateId);
    expect(h.snapshot('a').you?.seatId).toBe('1');
    await h.send('a', { action: 'leave', seatToken: token });
    expect(h.store.seats.get(privateId)!.size).toBe(0);

    await h.connect('lobby');
    await h.send('lobby', { action: 'list_tables', tableIds: [privateId, TABLE_ID] });
    expect(h.last('lobby', 'table_list').tables.map((t) => t.tableId)).toEqual([TABLE_ID]);
  });
});

describe('concurrency', () => {
  it('retries a commit that lost a race', async () => {
    const racing = new Harness({ failCommits: 2 });
    await racing.seed();
    await racing.seat('a');
    expect(racing.snapshot('a').you?.seatId).toBe('1');
  });

  it('gives up with version_conflict after repeated races', async () => {
    const racing = new Harness({ failCommits: 10 });
    await racing.seed();
    await racing.connect('a');
    await racing.send('a', { action: 'join_table', tableId: TABLE_ID });
    await racing.send('a', { action: 'sit' });
    expect(racing.lastError('a')).toEqual({ type: 'error', code: 'version_conflict' });
  });
});
