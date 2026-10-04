import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../support/cognito-tokens.js';
import { tiles } from '../support/game-fixtures.js';
import { Harness, TABLE_ID } from '../support/runtime-harness.js';

let h: Harness;
let tokenA: string;
let tokenB: string;

/** A signed in on seat 1, B as a guest on seat 2, game started with A to move and known racks. */
async function startRigged(rackA = 'CATDOGS', rackB = 'SHEEPIE') {
  tokenA = await h.seat('a', { accessToken: signAccessToken() });
  tokenB = await h.seat('b');
  await h.send('a', { action: 'start_game', seatToken: tokenA });
  h.rigRack('1', rackA);
  h.rigRack('2', rackB);
  h.rigGame((table) => {
    table.game.currentSeatId = '1';
  });
}

function playMove(letters: Array<[string, number, number, string?]>, seat = '1') {
  const used = new Map<string, number>();
  return letters.map(([letter, row, col, blankAs]) => {
    const key = letter;
    const skip = used.get(key) ?? 0;
    used.set(key, skip + 1);
    const tileId = h.tileId(seat, letter === '?' ? null : letter, skip);
    return blankAs ? { tileId, row, col, letter: blankAs } : { tileId, row, col };
  });
}

beforeEach(async () => {
  h = new Harness();
  await h.seed();
});
afterEach(() => vi.restoreAllMocks());

describe('a game between a signed-in player and a guest', () => {
  it('needs two seated players to start', async () => {
    const token = await h.seat('a');
    await h.send('a', { action: 'start_game', seatToken: token });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'insufficient_players' });
  });

  it('deals seven tiles each and shows only your own rack', async () => {
    tokenA = await h.seat('a', { accessToken: signAccessToken() });
    tokenB = await h.seat('b');
    await h.send('b', { action: 'start_game', seatToken: tokenB });
    const a = h.snapshot('a');
    const b = h.snapshot('b');
    expect(a.status).toBe('playing');
    expect(a.you!.rack).toHaveLength(7);
    expect(b.you!.rack).toHaveLength(7);
    expect(a.seats[1]).toMatchObject({ rackCount: 7, inGame: true });
    expect(a.bagCount).toBe(86);
    expect(a.you!.rack).not.toEqual(b.you!.rack);
  });

  it('commits a legal play, scores it for everyone, and refills the rack', async () => {
    await startRigged();
    await h.send('a', { action: 'play', seatToken: tokenA, placements: playMove([['C', 7, 6], ['A', 7, 7], ['T', 7, 8]]) });
    for (const viewer of ['a', 'b']) {
      const snapshot = h.snapshot(viewer);
      expect(snapshot.board.map((t) => t.letter).join('')).toBe('CAT');
      expect(snapshot.lastTurn).toMatchObject({ kind: 'play', seatId: '1', total: 10 });
      expect(snapshot.lastTurn!.beats.at(-1)).toEqual({ kind: 'total', total: 10, score: 10 });
      expect(snapshot.seats[0]!.score).toBe(10);
      expect(snapshot.currentSeatId).toBe('2');
    }
    expect(h.snapshot('a').you!.rack).toHaveLength(7);
  });

  it('rejects a word that is not in the dictionary and tells only the player', async () => {
    await startRigged('QZXAEIO');
    const before = h.messages('b').length;
    await h.send('a', { action: 'play', seatToken: tokenA, placements: playMove([['Q', 7, 6], ['Z', 7, 7], ['X', 7, 8]]) });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'invalid_word', words: ['QZX'] });
    expect(h.messages('b')).toHaveLength(before);
    expect(h.store.tables.get(TABLE_ID)!.game.board).toEqual([]);
  });

  it('refuses plays out of turn and malformed placements', async () => {
    await startRigged();
    await h.send('b', { action: 'play', seatToken: tokenB, placements: playMove([['S', 7, 7], ['H', 7, 8]], '2') });
    expect(h.lastError('b')).toEqual({ type: 'error', code: 'off_turn' });
    await h.send('a', { action: 'play', seatToken: tokenA, placements: 'CAT' });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'invalid_placement', reason: 'empty' });
    await h.send('a', { action: 'play', seatToken: tokenA, placements: [{ tileId: h.rackIds('2')[0], row: 7, col: 7 }] });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'invalid_placement', reason: 'not_your_tile' });
  });

  it('plays a blank as a chosen letter worth zero', async () => {
    await startRigged('?ATDOGS');
    await h.send('a', {
      action: 'play',
      seatToken: tokenA,
      placements: playMove([['?', 7, 6, 'C'], ['A', 7, 7], ['T', 7, 8]]),
    });
    const snapshot = h.snapshot('b');
    expect(snapshot.board[0]).toEqual({ row: 7, col: 6, letter: 'C', blank: true });
    expect(snapshot.lastTurn!.total).toBe(4);
  });

  it('exchanges only while the bag holds seven or more', async () => {
    await startRigged();
    h.rigGame((table) => {
      table.game.bag = tiles('EEEEEE', 'bag');
    });
    await h.send('a', { action: 'exchange', seatToken: tokenA, tileIds: h.rackIds('1').slice(0, 2) });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'exchange_unavailable' });
    h.rigGame((table) => {
      table.game.bag = tiles('EEEEEEE', 'bag');
    });
    await h.send('a', { action: 'exchange', seatToken: tokenA, tileIds: h.rackIds('1').slice(0, 2) });
    expect(h.snapshot('b').lastTurn).toMatchObject({ kind: 'exchange', exchanged: 2 });
  });

  it('finishes when a player goes out and settles the racks', async () => {
    await startRigged('CATS', 'QZ');
    h.rigGame((table) => {
      table.game.bag = [];
    });
    await h.send('a', {
      action: 'play',
      seatToken: tokenA,
      placements: playMove([['C', 7, 6], ['A', 7, 7], ['T', 7, 8], ['S', 7, 9]]),
    });
    for (const viewer of ['a', 'b']) {
      const snapshot = h.snapshot(viewer);
      expect(snapshot.status).toBe('ended');
      expect(snapshot.endReason).toBe('played_out');
      expect(snapshot.wentOutSeatId).toBe('1');
      expect(snapshot.finalAdjustments).toEqual({ 1: 20, 2: -20 });
      expect(snapshot.seats.map((s) => s.score)).toEqual([12 + 20, -20, 0, 0]);
    }
  });

  it('finishes after six scoreless turns and can start again', async () => {
    await startRigged('QZ', 'AE');
    for (let i = 0; i < 6; i++) {
      const [conn, token] = i % 2 === 0 ? ['a', tokenA] : ['b', tokenB];
      await h.send(conn, { action: 'pass', seatToken: token });
    }
    expect(h.snapshot('a')).toMatchObject({ status: 'ended', endReason: 'scoreless_turns', finalAdjustments: { 1: -20, 2: -2 } });
    await h.send('b', { action: 'start_game', seatToken: tokenB });
    expect(h.snapshot('a')).toMatchObject({ status: 'playing', board: [], lastTurn: null });
    expect(h.snapshot('a').seats.map((s) => s.score)).toEqual([0, 0, 0, 0]);
  });
});

describe('leaving', () => {
  it('drops a seat immediately between turns and ends a two-player game', async () => {
    await startRigged();
    await h.send('b', { action: 'leave', seatToken: tokenB });
    expect(h.last('b', 'left')).toEqual({ type: 'left', seatId: '2' });
    const snapshot = h.snapshot('a');
    expect(snapshot.seats[1]!.occupied).toBe(false);
    expect(snapshot.status).toBe('ended');
    expect(snapshot.endReason).toBe('abandoned');
    expect(snapshot.lastTurn).toBeNull();
  });

  it('auto-passes on your turn, then drops the seat and returns the rack to the bag', async () => {
    await startRigged();
    await h.seat('c');
    const bagBefore = h.store.tables.get(TABLE_ID)!.game.bag.length;
    await h.send('a', { action: 'leave', seatToken: tokenA });
    const snapshot = h.snapshot('b');
    expect(snapshot.status).toBe('playing');
    expect(snapshot.lastTurn).toMatchObject({ kind: 'auto_pass', seatId: '1' });
    expect(snapshot.currentSeatId).toBe('2');
    expect(snapshot.seats[0]!.occupied).toBe(false);
    expect(snapshot.bagCount).toBe(bagBefore + 7);
  });

  it('treats a disconnect the same way', async () => {
    await startRigged();
    await h.seat('c');
    await h.disconnect('a');
    const snapshot = h.snapshot('b');
    expect(snapshot.lastTurn).toMatchObject({ kind: 'auto_pass', seatId: '1' });
    expect(snapshot.seats[0]!.occupied).toBe(false);
    expect(h.store.connections.has('a')).toBe(false);
  });

  it('lets a player who left sit again with a fresh token while the old one is dead', async () => {
    tokenA = await h.seat('a', { accessToken: signAccessToken() });
    await h.send('a', { action: 'leave', seatToken: tokenA });
    await h.send('a', { action: 'sit', accessToken: signAccessToken() });
    const fresh = h.last('a', 'sat').seatToken;
    expect(fresh).not.toBe(tokenA);
    await h.send('a', { action: 'set_theme', seatToken: tokenA, themeId: 'christmas' });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'invalid_seat_token' });
    await h.send('a', { action: 'set_theme', seatToken: fresh, themeId: 'christmas' });
    expect(h.snapshot('a').themeId).toBe('christmas');
  });

  it('deals a late sitter into a game in progress', async () => {
    await startRigged();
    await h.seat('c');
    expect(h.snapshot('c').you!.rack).toHaveLength(7);
    expect(h.snapshot('a').seats[2]).toMatchObject({ inGame: true, rackCount: 7 });
  });
});
