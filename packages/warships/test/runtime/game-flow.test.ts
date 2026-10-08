import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerMessage } from '../../src/protocol.js';
import { BATTLE_START_MS, SHOT_ANIMATION_MS, SINK_ANNOUNCE_MS, TURN_LOCK_GRACE_MS } from '../../src/rules/constants.js';
import type { Coord } from '../../src/rules/types.js';
import { A_FLEET, B_FLEET, cellsOf, waterOf } from '../support/fleets.js';
import { Harness, TABLE_ID } from '../support/runtime-harness.js';

let h: Harness;
beforeEach(async () => {
  h = new Harness();
  await h.seed();
});
afterEach(() => vi.restoreAllMocks());

const types = (conn: string, from: number) => h.messages(conn).slice(from).map((m) => m.type);

/** Plays alternating shots: seat 1 walks `aTargets`, seat 2 walks `bTargets`, until the game ends or a list runs out. */
async function volley(tokens: { a: string; b: string }, aTargets: Coord[], bTargets: Coord[]) {
  for (let i = 0; i < aTargets.length; i++) {
    h.openTurn();
    await h.fire('a', tokens.a, aTargets[i]!);
    if (h.table().game.status === 'finished') return;
    if (!bTargets[i]) return;
    h.openTurn();
    await h.fire('b', tokens.b, bTargets[i]!);
    if (h.table().game.status === 'finished') return;
  }
}

describe('two captains sit down', () => {
  it('opens placement on its own once the second captain sits, as game 1', async () => {
    await h.seat('a');
    expect(h.snapshot('a')).toMatchObject({ status: 'waiting', gameNumber: 0 });
    await h.seat('b');
    for (const conn of ['a', 'b']) {
      expect(h.snapshot(conn)).toMatchObject({ status: 'placing', gameNumber: 1, currentSeatId: null });
      expect(h.snapshot(conn).seats.map((s) => [s.occupied, s.ready])).toEqual([
        [true, false],
        [true, false],
      ]);
    }
    expect(h.snapshot('a').you).toEqual({ seatId: '1', fleet: null, ready: false, incoming: [] });
    expect(h.snapshot('a').target).toEqual({ seatId: '2', shots: [], sunk: [], revealed: null });
  });

  it('flips a coin for who fires first when nothing fixes it', async () => {
    const firsts = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const coin = new Harness({ firstSeatId: null, seed });
      await coin.seed();
      await coin.seat('a');
      await coin.seat('b');
      firsts.add(coin.table().game.firstSeatId!);
    }
    expect(firsts).toEqual(new Set(['1', '2']));
  });

  it('goes to battle when both fleets are in, and shows each captain only their own', async () => {
    const a = await h.seat('a');
    const b = await h.seat('b');
    await h.place('a', a, [...A_FLEET].reverse());
    expect(h.snapshot('a').you).toMatchObject({ fleet: A_FLEET, ready: true });
    expect(h.snapshot('b').seats[0]!.ready).toBe(true);
    expect(h.snapshot('b').you!.fleet).toBeNull();

    await h.send('a', { action: 'unready', seatToken: a });
    expect(h.snapshot('a').you).toMatchObject({ fleet: A_FLEET, ready: false });
    await h.place('a', a, A_FLEET);

    await h.place('b', b, B_FLEET);
    const snap = h.snapshot('a');
    expect(snap).toMatchObject({ status: 'battle', currentSeatId: '1', turnNumber: 0, turnOpensAt: h.now + BATTLE_START_MS });
    expect(snap.seats.map((s) => s.shipsAfloat)).toEqual([5, 5]);
    await h.send('b', { action: 'unready', seatToken: b });
    expect(h.lastError('b')).toEqual({ type: 'error', code: 'not_placing' });
  });

  it('refuses an illegal fleet with its reason', async () => {
    const a = await h.seat('a');
    await h.seat('b');
    await h.place('a', a, [{ ...A_FLEET[0]!, col: 7 }, ...A_FLEET.slice(1)]);
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'invalid_fleet', reason: 'out_of_bounds' });
    await h.send('a', { action: 'place_fleet', seatToken: a, fleet: 'random' });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'invalid_fleet', reason: 'invalid_shape' });
  });
});

describe('battle', () => {
  it('sends both captains the shot, then the snapshot that contains it', async () => {
    const tokens = await h.battle({ a: A_FLEET, b: B_FLEET });
    const before = { a: h.messages('a').length, b: h.messages('b').length };
    const target = cellsOf(B_FLEET, 'carrier')[0]!;
    await h.fire('a', tokens.a, target);

    for (const conn of ['a', 'b'] as const) {
      expect(types(conn, before[conn])).toEqual(['shot', 'table_snapshot']);
      const shot = h.last(conn, 'shot');
      expect(shot).toEqual({
        type: 'shot',
        tableId: TABLE_ID,
        shotId: '1-1',
        gameNumber: 1,
        turnNumber: 1,
        shooter: '1',
        target: '2',
        coord: target,
        result: 'hit',
        gameOver: false,
        serverTs: h.now,
        animationMs: SHOT_ANIMATION_MS,
        nextSeatId: '2',
        turnOpensAt: h.now + SHOT_ANIMATION_MS - TURN_LOCK_GRACE_MS,
        winnerSeatId: null,
      });
      expect(h.snapshot(conn).lastShot?.shotId).toBe('1-1');
      expect(h.snapshot(conn).currentSeatId).toBe('2');
    }
    expect(h.snapshot('a').target!.shots).toEqual([{ ...target, result: 'hit', turnNumber: 1 }]);
    expect(h.snapshot('b').you!.incoming).toEqual([{ ...target, result: 'hit', turnNumber: 1 }]);
  });

  it('holds the next turn until the shot has played', async () => {
    const tokens = await h.battle({ a: A_FLEET, b: B_FLEET });
    await h.fire('a', tokens.a, waterOf(B_FLEET)[0]!);
    h.advance(SHOT_ANIMATION_MS - TURN_LOCK_GRACE_MS - 1);
    await h.fire('b', tokens.b, waterOf(A_FLEET)[0]!);
    expect(h.lastError('b')).toEqual({ type: 'error', code: 'turn_not_open' });
    h.advance(1);
    await h.fire('b', tokens.b, waterOf(A_FLEET)[0]!);
    expect(h.last('b', 'shot').shooter).toBe('2');

    h.openTurn();
    await h.fire('b', tokens.b, waterOf(A_FLEET)[1]!);
    expect(h.lastError('b')).toEqual({ type: 'error', code: 'not_your_turn' });
  });

  it('refuses a malformed or repeated target', async () => {
    const tokens = await h.battle({ a: A_FLEET, b: B_FLEET });
    await h.send('a', { action: 'fire', seatToken: tokens.a, target: 'C7' });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'invalid_target' });
    await h.fire('a', tokens.a, { row: 0, col: 10 });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'invalid_target' });
    await h.fire('a', tokens.a, { row: 5, col: 5 });
    h.openTurn();
    await h.fire('b', tokens.b, { row: 5, col: 5 });
    h.openTurn();
    await h.fire('a', tokens.a, { row: 5, col: 5 });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'already_fired' });
  });

  it('announces a sinking to both sides with the ship’s placement', async () => {
    const tokens = await h.battle({ a: A_FLEET, b: B_FLEET });
    const destroyer = cellsOf(B_FLEET, 'destroyer');
    await volley(tokens, destroyer, waterOf(A_FLEET).slice(0, 1));
    const sunk = { shipId: 'destroyer', row: 8, col: 1, orientation: 'vertical', length: 2, sunkOnTurn: 3 };
    for (const conn of ['a', 'b']) {
      expect(h.last(conn, 'shot')).toMatchObject({ sunkShip: sunk, animationMs: SHOT_ANIMATION_MS + SINK_ANNOUNCE_MS });
    }
    expect(h.snapshot('a').target!.sunk).toEqual([sunk]);
    expect(h.snapshot('a').seats[1]!.shipsAfloat).toBe(4);
  });

  it('plays a whole game to the end, revealing both fleets and the report', async () => {
    const tokens = await h.battle({ a: A_FLEET, b: B_FLEET });
    await volley(tokens, cellsOf(B_FLEET), waterOf(A_FLEET));
    const finale = h.last('b', 'shot');
    expect(finale).toMatchObject({ gameOver: true, winnerSeatId: '1', nextSeatId: null, turnOpensAt: null });

    for (const conn of ['a', 'b']) {
      const snap = h.snapshot(conn);
      expect(snap).toMatchObject({ status: 'finished', winnerSeatId: '1', endReason: 'fleet_sunk', currentSeatId: null });
      expect(snap.recap).toMatchObject({
        fleets: { '1': A_FLEET, '2': B_FLEET },
        roster: { '1': { displayName: expect.any(String) }, '2': { displayName: expect.any(String) } },
        startedAt: expect.any(String),
        endedAt: expect.any(String),
      });
      expect(snap.recap!.shots).toHaveLength(33);
    }
    expect(h.snapshot('a').target!.revealed).toEqual(B_FLEET);
    expect(h.snapshot('b').target!.revealed).toEqual(A_FLEET);
    expect(h.snapshot('a').seats.map((s) => s.shipsAfloat)).toEqual([5, 0]);
  });
});

describe('after the game', () => {
  async function finishedGame() {
    const tokens = await h.battle({ a: A_FLEET, b: B_FLEET });
    await volley(tokens, cellsOf(B_FLEET), waterOf(A_FLEET));
    return tokens;
  }

  it('starts a rematch once both vote, as the next game with the loser firing first', async () => {
    const tokens = await finishedGame();
    await h.send('a', { action: 'rematch', seatToken: tokens.a });
    expect(h.snapshot('b')).toMatchObject({ status: 'finished', rematchVotes: ['1'] });
    await h.send('b', { action: 'rematch', seatToken: tokens.b });
    expect(h.snapshot('a')).toMatchObject({ status: 'placing', gameNumber: 2, rematchVotes: [] });
    expect(h.snapshot('a').you).toEqual({ seatId: '1', fleet: null, ready: false, incoming: [] });
    expect(h.snapshot('a').recap).toBeUndefined();

    await h.place('a', tokens.a, A_FLEET);
    await h.place('b', tokens.b, B_FLEET);
    expect(h.snapshot('a')).toMatchObject({ status: 'battle', currentSeatId: '2', turnNumber: 0 });
    h.openTurn();
    await h.fire('b', tokens.b, { row: 9, col: 9 });
    expect(h.last('a', 'shot').shotId).toBe('2-1');
  });

  it('refuses a rematch mid-game or without an opponent', async () => {
    const tokens = await h.battle({ a: A_FLEET, b: B_FLEET });
    await h.send('a', { action: 'rematch', seatToken: tokens.a });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'not_finished' });
    await volley(tokens, cellsOf(B_FLEET), waterOf(A_FLEET));
    await h.send('b', { action: 'leave', seatToken: tokens.b });
    await h.send('a', { action: 'rematch', seatToken: tokens.a });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'no_opponent' });
  });

  it('forgets a rematch vote when its captain leaves, and starts afresh when someone new sits', async () => {
    const tokens = await finishedGame();
    await h.send('b', { action: 'rematch', seatToken: tokens.b });
    await h.send('b', { action: 'leave', seatToken: tokens.b });
    expect(h.snapshot('a')).toMatchObject({ status: 'finished', rematchVotes: [] });
    expect(h.snapshot('a').target!.revealed).toEqual(B_FLEET);

    await h.seat('c');
    expect(h.snapshot('c')).toMatchObject({ status: 'placing', gameNumber: 2 });
    expect(h.snapshot('a').you!.fleet).toBeNull();
  });
});

describe('leaving and forfeits', () => {
  it('treats leaving mid-battle as a forfeit', async () => {
    const tokens = await h.battle({ a: A_FLEET, b: B_FLEET });
    await h.send('b', { action: 'leave', seatToken: tokens.b });
    expect(h.last('b', 'left')).toEqual({ type: 'left', seatId: '2' });
    expect(h.snapshot('a')).toMatchObject({ status: 'finished', winnerSeatId: '1', endReason: 'forfeit' });
    expect(h.snapshot('a').seats[1]!.occupied).toBe(false);
    expect(h.snapshot('a').recap!.roster['2']).toBeDefined();
  });

  it('forfeits on request in placing or battle only', async () => {
    const a = await h.seat('a');
    await h.send('a', { action: 'forfeit', seatToken: a });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'not_in_battle' });
    const b = await h.seat('b');
    await h.send('b', { action: 'forfeit', seatToken: b });
    expect(h.snapshot('a')).toMatchObject({ status: 'finished', winnerSeatId: '1', endReason: 'forfeit' });
  });

  it('sends a placement back to waiting when a captain leaves it', async () => {
    const a = await h.seat('a');
    const b = await h.seat('b');
    await h.place('a', a, A_FLEET);
    await h.send('b', { action: 'leave', seatToken: b });
    expect(h.snapshot('a')).toMatchObject({ status: 'waiting', gameNumber: 1 });
    expect(h.snapshot('a').you).toEqual({ seatId: '1', fleet: null, ready: false, incoming: [] });
    expect(h.snapshot('a').seats[0]!.ready).toBe(false);

    await h.seat('c');
    expect(h.snapshot('a')).toMatchObject({ status: 'placing', gameNumber: 2 });
  });

  it('tells everyone at the table when the host deletes it mid-battle', async () => {
    const tokens = await h.battle({ a: A_FLEET, b: B_FLEET });
    await h.connect('host');
    await h.send('host', { action: 'delete_table', accessToken: h.tokenFor('admiral'), tableId: TABLE_ID });
    const notice: ServerMessage = { type: 'table_deleted', tableId: TABLE_ID };
    expect(h.last('a', 'table_deleted')).toEqual(notice);
    expect(h.last('b', 'table_deleted')).toEqual(notice);
    await h.fire('a', tokens.a, { row: 0, col: 0 });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'table_not_found' });
  });
});

describe('ping', () => {
  it('answers with the server time', async () => {
    await h.connect('c');
    await h.send('c', { action: 'ping' });
    expect(h.lastError('c')).toEqual({ type: 'pong', serverTs: h.now });
  });
});
