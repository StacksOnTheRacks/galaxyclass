import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AWAY_ABANDON_AFTER_MS, SETUP_AWAY_AFTER_MS } from '../../src/rules/constants.js';
import { attackerKey, signAccessToken } from '../support/cognito-tokens.js';
import { Harness, TABLE_ID } from '../support/runtime-harness.js';

let h: Harness;
beforeEach(async () => {
  h = new Harness();
  await h.seed();
});
afterEach(() => vi.restoreAllMocks());

describe('table session', () => {
  it('answers an unknown table id with table_not_found', async () => {
    await h.connect('c1');
    await h.join('c1', '00000000-0000-4000-8000-000000000000');
    expect(h.lastError('c1')).toEqual({ type: 'error', code: 'table_not_found' });
    expect(h.store.connections.get('c1')?.tableId).toBeUndefined();
  });

  it('requires join_table before anything else', async () => {
    await h.connect('c1');
    await h.send('c1', { action: 'sit', accessToken: h.tokenFor('c1') });
    expect(h.lastError('c1')).toEqual({ type: 'error', code: 'not_table_member' });
    await h.send('c1', { action: 'roll', seatToken: 'x' });
    expect(h.lastError('c1')).toEqual({ type: 'error', code: 'not_table_member' });
  });

  it('refuses malformed and unknown messages', async () => {
    await h.connect('c1');
    await h.send('c1', 'not json');
    await h.send('c1', { nope: true });
    await h.send('c1', { action: 'fire' });
    expect(h.messages('c1')).toEqual([
      { type: 'error', code: 'unsupported_action' },
      { type: 'error', code: 'unsupported_action' },
      { type: 'error', code: 'not_table_member' },
    ]);
    await h.join('c1');
    await h.send('c1', { action: 'fire' });
    expect(h.lastError('c1')).toEqual({ type: 'error', code: 'unsupported_action' });
  });

  it('sends a six-seat snapshot on join with no board for a viewer without a seat', async () => {
    await h.connect('c1');
    await h.join('c1');
    const snapshot = h.snapshot('c1');
    expect(snapshot).toMatchObject({
      tableId: TABLE_ID,
      tableName: 'Starfall Manor',
      status: 'setup',
      you: null,
      positions: null,
      weapons: null,
      log: [],
      solution: null,
      hostSeatId: null,
      serverTs: h.now,
    });
    expect(snapshot.seats.map((s) => s.occupied)).toEqual([false, false, false, false, false, false]);
  });
});

describe('sit', () => {
  it('seats a verified account under its studio gamer tag and avatar, ignoring client-sent names', async () => {
    await h.seat('a', { accessToken: signAccessToken(), displayName: 'Impostor', avatarId: 3 });
    expect(h.snapshot('a').seats[0]).toMatchObject({ displayName: 'Inspector', avatarId: 12, isLocal: true, isHost: true });
  });

  it('names a member without a gamer tag on the server', async () => {
    await h.seat('a');
    expect(h.snapshot('a').seats[0]!.displayName).toContain(' ');
  });

  it('never seats a missing or bad access token', async () => {
    await h.connect('a');
    await h.join('a');
    await h.send('a', { action: 'sit' });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'sign_in_required' });
    await h.send('a', { action: 'sit', accessToken: signAccessToken({}, attackerKey) });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'invalid_access_token' });
    expect(h.store.seats.get(TABLE_ID)!.size).toBe(0);
  });

  it('enforces one seat per connection and six seats per table', async () => {
    await h.seat('a', { seatId: '2' });
    await h.send('a', { action: 'sit', accessToken: h.tokenFor('a') });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'already_seated' });

    const b = h.tokenFor('b');
    await h.connect('b');
    await h.join('b');
    await h.send('b', { action: 'sit', seatId: '2', accessToken: b });
    expect(h.lastError('b')).toEqual({ type: 'error', code: 'seat_occupied' });
    await h.send('b', { action: 'sit', seatId: '7', accessToken: b });
    expect(h.lastError('b')).toEqual({ type: 'error', code: 'invalid_seat' });
    await h.send('b', { action: 'sit', accessToken: b });
    expect(h.last('b', 'sat').seatId).toBe('1');

    for (const conn of ['c', 'd', 'e', 'f']) await h.seat(conn);
    await h.connect('g');
    await h.join('g');
    await h.send('g', { action: 'sit', accessToken: h.tokenFor('g') });
    expect(h.lastError('g')).toEqual({ type: 'error', code: 'table_full' });
  });

  it('stores only the hash of the seat token', async () => {
    const token = await h.seat('a');
    expect(JSON.stringify(h.store.seats.get(TABLE_ID)!.get('1'))).not.toContain(token);
  });

  it('frees a departed detective’s suspect for whoever sits in the seat next', async () => {
    const a = await h.seat('a');
    await h.send('a', { action: 'choose_suspect', seatToken: a, suspect: 'rook' });
    await h.send('a', { action: 'leave', seatToken: a });
    const b = await h.seat('b');
    expect(h.snapshot('b').seats[0]).toMatchObject({ suspect: null });
    await h.send('b', { action: 'choose_suspect', seatToken: b, suspect: 'rook' });
    expect(h.snapshot('b').you!.suspect).toBe('rook');
  });
});

describe('reconnecting', () => {
  it('resumes a seat after a reload with the hand intact', async () => {
    await h.setupCase();
    const hand = h.game().hands['2'];
    await h.disconnect('b');
    expect(h.snapshot('a').seats[1]).toMatchObject({ occupied: true, connected: false, awaySince: new Date(h.now).toISOString() });
    expect(h.game().status).toBe('playing');

    await h.connect('b2');
    await h.join('b2', TABLE_ID, h.tokenFor('b'));
    await h.send('b2', { action: 'resume', seatToken: h.tokens.get('b') });
    expect(h.last('b2', 'sat')).toEqual({ type: 'sat', seatId: '2', seatToken: h.tokens.get('b') });
    const snap = h.snapshot('b2');
    expect(snap.you).toMatchObject({ seatId: '2', suspect: 'finch', hand });
    expect(snap.seats[1]).toMatchObject({ connected: true, awaySince: null });
    expect(snap.log.map((e) => e.kind)).toEqual(['game_started']);
  });

  it('never lets another member resume a seat, even holding its token', async () => {
    await h.setupCase();
    await h.disconnect('b');
    const before = h.table().version;

    // A second account in the same browser profile finds the first account's token in storage.
    await h.connect('x');
    await h.join('x', TABLE_ID, h.tokenFor('x'));
    await h.send('x', { action: 'resume', seatToken: h.tokens.get('b') });
    expect(h.lastError('x')).toEqual({ type: 'error', code: 'seat_not_yours' });
    expect(h.store.seats.get(TABLE_ID)!.get('2')!.connectionId).toBeUndefined();
    expect(h.store.connections.get('x')?.seatId).toBeUndefined();
    expect(h.table().version).toBe(before);
    expect(h.snapshot('x')).toMatchObject({ you: null, positions: null });
  });

  it('drops the seat when a connection re-joins as a different member', async () => {
    const a = await h.seat('a');
    await h.join('a', TABLE_ID, h.tokenFor('x'));
    expect(h.store.connections.get('a')).toMatchObject({ tableId: TABLE_ID, playerSub: 'sub-x' });
    expect(h.store.connections.get('a')?.seatId).toBeUndefined();
    expect(h.snapshot('a').you).toBeNull();
    await h.send('a', { action: 'resume', seatToken: a });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'seat_not_yours' });
  });

  it('moves a seat to the account’s newest window and cuts off the old one', async () => {
    await h.setupCase();
    const fresh = await h.seat('b2', { accessToken: h.tokenFor('b') });
    expect(fresh).not.toBe(h.tokens.get('b'));
    expect(h.last('b', 'left')).toEqual({ type: 'left', seatId: '2', reason: 'taken_over' });
    expect(h.snapshot('b').you).toBeNull();
    expect(h.snapshot('b2').you?.hand).toEqual(h.game().hands['2']);

    await h.act('a', 'roll');
    expect(h.events('b2')).toHaveLength(1);
    await h.act('b', 'leave');
    expect(h.lastError('b')).toEqual({ type: 'error', code: 'invalid_seat_token' });
  });

  it('holds a seat through a disconnect in setup and mid-case, and frees it after the case', async () => {
    await h.seat('a');
    await h.disconnect('a');
    expect(h.store.seats.get(TABLE_ID)!.get('1')!.awaySince).toBeDefined();

    const done = new Harness();
    await done.seed();
    await done.setupCase();
    await done.act('a', 'accuse', { ...done.game().solution! });
    await done.disconnect('c');
    expect(done.store.seats.get(TABLE_ID)!.has('3')).toBe(false);
  });
});

describe('claiming abandoned seats', () => {
  it('clears a seat left away in setup after a minute', async () => {
    const a = await h.seat('a');
    await h.seat('b');
    await h.send('a', { action: 'claim_abandoned', seatToken: a });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'no_one_away' });
    await h.disconnect('b');
    h.advance(SETUP_AWAY_AFTER_MS - 1);
    await h.send('a', { action: 'claim_abandoned', seatToken: a });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'away_too_recent' });
    h.advance(1);
    await h.send('a', { action: 'claim_abandoned', seatToken: a });
    expect(h.snapshot('a').seats[1]!.occupied).toBe(false);
  });

  it('lays an away detective’s cards face up mid-case after ten minutes', async () => {
    await h.setupCase(['a', 'b', 'c', 'd']);
    await h.disconnect('c');
    h.advance(AWAY_ABANDON_AFTER_MS - 1);
    await h.act('a', 'claim_abandoned');
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'away_too_recent' });
    h.advance(1);
    const hand = h.game().hands['3'];
    await h.act('b', 'claim_abandoned');
    expect(h.last('a', 'event').event).toMatchObject({ kind: 'departed', seatId: '3', reason: 'abandoned', revealed: hand });
    expect(h.snapshot('a')).toMatchObject({ status: 'playing', revealedCards: hand });
    expect(h.snapshot('a').seats[2]!.occupied).toBe(false);
  });

  it('ends the case when the claim leaves one detective', async () => {
    await h.setupCase();
    await h.disconnect('b');
    await h.disconnect('c');
    h.advance(AWAY_ABANDON_AFTER_MS);
    await h.act('a', 'claim_abandoned');
    expect(h.events('a').slice(-2).map((m) => m.event.kind)).toEqual(['departed', 'game_over']);
    expect(h.snapshot('a')).toMatchObject({ status: 'finished', endReason: 'abandoned' });
    await h.act('a', 'claim_abandoned');
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'not_playing' });
  });
});

describe('seat token', () => {
  it('rejects a missing, wrong, or stolen seat token', async () => {
    await h.setupCase();
    const before = h.table().version;
    await h.send('a', { action: 'roll' });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'invalid_seat_token' });
    await h.send('a', { action: 'roll', seatToken: 'not-a-real-token' });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'invalid_seat_token' });
    await h.send('a', { action: 'roll', seatToken: h.tokens.get('b') });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'not_seated' });
    expect(h.table().version).toBe(before);
  });

  it('is useless from a connection that has not joined the table', async () => {
    const token = await h.seat('a');
    await h.connect('thief');
    await h.send('thief', { action: 'leave', seatToken: token });
    expect(h.lastError('thief')).toEqual({ type: 'error', code: 'not_table_member' });
    await h.join('thief');
    await h.send('thief', { action: 'leave', seatToken: token });
    expect(h.lastError('thief')).toEqual({ type: 'error', code: 'not_seated' });
  });
});

describe('client-supplied state', () => {
  it('is rejected on every action', async () => {
    await h.setupCase();
    for (const extra of [{ solution: {} }, { hands: {} }, { dice: [6, 6] }, { positions: {} }, { winnerSeatId: '1' }, { path: [] }]) {
      await h.act('a', 'roll', extra);
      expect(h.lastError('a')).toEqual({ type: 'error', code: 'client_supplied_state' });
    }
    await h.act('a', 'accuse', { suspect: 'rook', weapon: 'vial', room: 'parlor', correct: true, status: 'finished' });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'client_supplied_state' });
    expect(h.game().turn!.phase).toBe('start');
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
    await racing.join('a');
    await racing.send('a', { action: 'sit', accessToken: racing.tokenFor('a') });
    expect(racing.lastError('a')).toEqual({ type: 'error', code: 'version_conflict' });
  });
});
