import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AWAY_ABANDON_AFTER_MS } from '../../src/rules/constants.js';
import { attackerKey, signAccessToken } from '../support/cognito-tokens.js';
import { A_FLEET, B_FLEET, cellsOf, waterOf } from '../support/fleets.js';
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
    await h.send('c1', { action: 'fire', seatToken: 'x', target: { row: 0, col: 0 } });
    expect(h.lastError('c1')).toEqual({ type: 'error', code: 'not_table_member' });
  });

  it('refuses malformed and unknown messages', async () => {
    await h.connect('c1');
    await h.send('c1', 'not json');
    await h.send('c1', { nope: true });
    await h.send('c1', { action: 'start_game' });
    expect(h.messages('c1')).toEqual([
      { type: 'error', code: 'unsupported_action' },
      { type: 'error', code: 'unsupported_action' },
      { type: 'error', code: 'not_table_member' },
    ]);
    await h.join('c1');
    await h.send('c1', { action: 'start_game' });
    expect(h.lastError('c1')).toEqual({ type: 'error', code: 'unsupported_action' });
  });

  it('sends a two-seat snapshot on join with no boards for a viewer without a seat', async () => {
    await h.connect('c1');
    await h.join('c1');
    const snapshot = h.snapshot('c1');
    expect(snapshot).toMatchObject({
      tableId: TABLE_ID,
      tableName: 'Pacific',
      status: 'waiting',
      you: null,
      target: null,
      lastShot: null,
      serverTs: h.now,
    });
    expect(snapshot.seats.map((s) => s.occupied)).toEqual([false, false]);
  });
});

describe('sit', () => {
  it('seats a verified account under its studio gamer tag and avatar, ignoring client-sent names', async () => {
    await h.seat('a', { accessToken: signAccessToken(), displayName: 'Impostor', avatarId: 3 });
    expect(h.snapshot('a').seats[0]).toMatchObject({ displayName: 'Admiral', avatarId: 12, isLocal: true });
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

  it('enforces one seat per connection and two seats per table', async () => {
    await h.seat('a', { seatId: '2' });
    await h.send('a', { action: 'sit', accessToken: h.tokenFor('a') });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'already_seated' });

    const b = h.tokenFor('b');
    await h.connect('b');
    await h.join('b');
    await h.send('b', { action: 'sit', seatId: '2', accessToken: b });
    expect(h.lastError('b')).toEqual({ type: 'error', code: 'seat_occupied' });
    await h.send('b', { action: 'sit', seatId: '3', accessToken: b });
    expect(h.lastError('b')).toEqual({ type: 'error', code: 'invalid_seat' });
    await h.send('b', { action: 'sit', accessToken: b });
    expect(h.last('b', 'sat').seatId).toBe('1');
  });

  it('stores only the hash of the seat token', async () => {
    const token = await h.seat('a');
    expect(JSON.stringify(h.store.seats.get(TABLE_ID)!.get('1'))).not.toContain(token);
  });
});

describe('a third member', () => {
  it('is locked out of a game in progress and never sees a shot', async () => {
    const tokens = await h.battle({ a: A_FLEET, b: B_FLEET });
    await h.connect('c');
    await h.join('c');
    await h.send('c', { action: 'sit', accessToken: h.tokenFor('c') });
    expect(h.lastError('c')).toEqual({ type: 'error', code: 'table_locked' });
    await h.fire('a', tokens.a, cellsOf(B_FLEET)[0]!);
    expect(h.shots('c')).toEqual([]);
    expect(h.snapshot('c')).toMatchObject({ status: 'battle', you: null, target: null, lastShot: null });
  });

  it('finds a finished table full while both captains are still seated', async () => {
    const tokens = await h.battle({ a: A_FLEET, b: B_FLEET });
    await h.send('a', { action: 'forfeit', seatToken: tokens.a });
    await h.connect('c');
    await h.join('c');
    await h.send('c', { action: 'sit', accessToken: h.tokenFor('c') });
    expect(h.lastError('c')).toEqual({ type: 'error', code: 'table_full' });
    expect(h.snapshot('c').recap).toBeUndefined();
  });
});

describe('reconnecting', () => {
  it('resumes a seat after a reload with the board intact', async () => {
    const tokens = await h.battle({ a: A_FLEET, b: B_FLEET });
    await h.fire('a', tokens.a, cellsOf(B_FLEET)[0]!);
    await h.disconnect('b');
    expect(h.snapshot('a').seats[1]).toMatchObject({ occupied: true, connected: false, awaySince: new Date(h.now).toISOString() });
    expect(h.table().game.status).toBe('battle');

    await h.connect('b2');
    await h.join('b2', TABLE_ID, h.tokenFor('b'));
    await h.send('b2', { action: 'resume', seatToken: tokens.b });
    expect(h.last('b2', 'sat')).toEqual({ type: 'sat', seatId: '2', seatToken: tokens.b });
    const snap = h.snapshot('b2');
    expect(snap.you).toMatchObject({ seatId: '2', fleet: B_FLEET, ready: true });
    expect(snap.you!.incoming).toHaveLength(1);
    expect(snap.seats[1]).toMatchObject({ connected: true, awaySince: null });

    h.openTurn();
    await h.fire('b2', tokens.b, waterOf(A_FLEET)[0]!);
    expect(h.last('a', 'shot').shooter).toBe('2');
  });

  it('never lets another member resume a seat, even holding its token', async () => {
    const tokens = await h.battle({ a: A_FLEET, b: B_FLEET });
    await h.disconnect('b');
    const before = h.table().version;

    // A second account in the same browser profile finds the first account's token in storage.
    await h.connect('c');
    await h.join('c', TABLE_ID, h.tokenFor('c'));
    await h.send('c', { action: 'resume', seatToken: tokens.b });
    expect(h.lastError('c')).toEqual({ type: 'error', code: 'seat_not_yours' });
    expect(h.store.seats.get(TABLE_ID)!.get('2')!.connectionId).toBeUndefined();
    expect(h.store.connections.get('c')?.seatId).toBeUndefined();
    expect(h.table().version).toBe(before);
    expect(h.snapshot('c')).toMatchObject({ you: null, target: null });

    await h.connect('b2');
    await h.join('b2', TABLE_ID, h.tokenFor('b'));
    await h.send('b2', { action: 'resume', seatToken: tokens.b });
    expect(h.last('b2', 'sat').seatId).toBe('2');
  });

  it('drops the seat when a connection re-joins as a different member', async () => {
    const tokens = await h.battle({ a: A_FLEET, b: B_FLEET });
    await h.join('a', TABLE_ID, h.tokenFor('c'));
    expect(h.store.connections.get('a')).toMatchObject({ tableId: TABLE_ID, playerSub: 'sub-c' });
    expect(h.store.connections.get('a')?.seatId).toBeUndefined();
    expect(h.store.seats.get(TABLE_ID)!.get('1')!.connectionId).toBeUndefined();
    expect(h.snapshot('a').you).toBeNull();
    await h.send('a', { action: 'resume', seatToken: tokens.a });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'seat_not_yours' });
  });

  it('moves a seat to the account’s newest window and cuts off the old one', async () => {
    const tokens = await h.battle({ a: A_FLEET, b: B_FLEET });
    const fresh = await h.seat('b2', { accessToken: h.tokenFor('b') });
    expect(fresh).not.toBe(tokens.b);
    expect(h.last('b', 'left')).toEqual({ type: 'left', seatId: '2', reason: 'taken_over' });
    expect(h.snapshot('b').you).toBeNull();
    expect(h.snapshot('b2').you?.fleet).toEqual(B_FLEET);

    await h.fire('a', tokens.a, cellsOf(B_FLEET)[0]!);
    expect(h.shots('b2')).toHaveLength(1);
    expect(h.shots('b')).toEqual([]);
    await h.send('b', { action: 'forfeit', seatToken: tokens.b });
    expect(h.lastError('b')).toEqual({ type: 'error', code: 'invalid_seat_token' });
  });

  it('frees the seat on a disconnect outside a game', async () => {
    await h.seat('a');
    await h.disconnect('a');
    expect(h.store.seats.get(TABLE_ID)!.size).toBe(0);
  });

  it('holds a seat through a disconnect during placement', async () => {
    await h.seat('a');
    await h.seat('b');
    await h.disconnect('b');
    expect(h.table().game.status).toBe('placing');
    expect(h.store.seats.get(TABLE_ID)!.get('2')!.awaySince).toBeDefined();
  });
});

describe('claiming an abandoned game', () => {
  it('lets the present captain win once the other has been away ten minutes', async () => {
    const tokens = await h.battle({ a: A_FLEET, b: B_FLEET });
    await h.send('a', { action: 'claim_abandoned', seatToken: tokens.a });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'opponent_not_away' });

    await h.disconnect('b');
    h.advance(AWAY_ABANDON_AFTER_MS - 1);
    await h.send('a', { action: 'claim_abandoned', seatToken: tokens.a });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'away_too_recent' });

    h.advance(1);
    await h.send('a', { action: 'claim_abandoned', seatToken: tokens.a });
    expect(h.snapshot('a')).toMatchObject({ status: 'finished', winnerSeatId: '1', endReason: 'abandoned' });
  });

  it('works during placement too, and not once the game is over', async () => {
    const a = await h.seat('a');
    await h.seat('b');
    await h.disconnect('b');
    h.advance(AWAY_ABANDON_AFTER_MS);
    await h.send('a', { action: 'claim_abandoned', seatToken: a });
    expect(h.snapshot('a')).toMatchObject({ status: 'finished', endReason: 'abandoned' });
    await h.send('a', { action: 'claim_abandoned', seatToken: a });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'not_in_battle' });
  });
});

describe('seat token', () => {
  it('rejects a missing, wrong, or stolen seat token', async () => {
    const tokens = await h.battle({ a: A_FLEET, b: B_FLEET });
    const before = h.table().version;
    await h.send('a', { action: 'fire', target: { row: 0, col: 0 } });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'invalid_seat_token' });
    await h.send('a', { action: 'fire', seatToken: 'not-a-real-token', target: { row: 0, col: 0 } });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'invalid_seat_token' });
    await h.send('a', { action: 'fire', seatToken: tokens.b, target: { row: 0, col: 0 } });
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
    const tokens = await h.battle({ a: A_FLEET, b: B_FLEET });
    for (const extra of [{ boards: {} }, { history: [] }, { result: 'hit' }, { winnerSeatId: '1' }, { sunk: [] }]) {
      await h.send('a', { action: 'fire', seatToken: tokens.a, target: { row: 0, col: 0 }, ...extra });
      expect(h.lastError('a')).toEqual({ type: 'error', code: 'client_supplied_state' });
    }
    await h.send('a', { action: 'place_fleet', seatToken: tokens.a, fleet: A_FLEET, status: 'battle' });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'client_supplied_state' });
    expect(h.table().game.turnNumber).toBe(0);
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
