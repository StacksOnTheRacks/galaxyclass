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

describe('away players', () => {
  it('holds a seat, rack, and turn through a disconnect instead of ending the game', async () => {
    await startRigged();
    const rackBefore = h.rackIds('1');
    await h.disconnect('a');
    const seen = h.snapshot('b');
    expect(seen.status).toBe('playing');
    expect(seen.lastTurn).toBeNull();
    expect(seen.currentSeatId).toBe('1');
    expect(seen.seats[0]).toMatchObject({ occupied: true, connected: false, awaySince: '2026-10-04T12:00:00.000Z', rackCount: 7 });
    expect(h.rackIds('1')).toEqual(rackBefore);
    expect(h.store.connections.has('a')).toBe(false);
  });

  it('resumes the held seat from a new connection with the same seat token', async () => {
    await startRigged();
    await h.disconnect('b');
    h.advance(3 * 60 * 60 * 1000);
    await h.connect('b2');
    await h.send('b2', { action: 'join_table', tableId: TABLE_ID });
    expect(h.snapshot('b2').you).toBeNull();
    await h.send('b2', { action: 'resume', seatToken: tokenB });
    expect(h.last('b2', 'sat')).toEqual({ type: 'sat', seatId: '2', seatToken: tokenB });
    expect(h.snapshot('b2').you!.rack.map((t) => t.letter).join('')).toBe('SHEEPIE');
    expect(h.snapshot('a').seats[1]).toMatchObject({ connected: true, awaySince: null });

    await h.send('a', { action: 'pass', seatToken: tokenA });
    await h.send('b2', { action: 'pass', seatToken: tokenB });
    expect(h.snapshot('a').lastTurn).toMatchObject({ kind: 'pass', seatId: '2' });
  });

  it('refuses to resume with a token that matches no seat', async () => {
    await startRigged();
    await h.connect('x');
    await h.send('x', { action: 'join_table', tableId: TABLE_ID });
    await h.send('x', { action: 'resume', seatToken: 'forged' });
    expect(h.lastError('x')).toEqual({ type: 'error', code: 'invalid_seat_token' });
  });

  it('gives a signed-in player their seat back on another device without the old token', async () => {
    await startRigged();
    await h.disconnect('a');
    const fresh = await h.seat('a-phone', { accessToken: signAccessToken() });
    expect(h.last('a-phone', 'sat').seatId).toBe('1');
    expect(h.snapshot('a-phone').you!.rack.map((t) => t.letter).join('')).toBe('CATDOGS');
    await h.send('a-phone', { action: 'play', seatToken: fresh, placements: playMove([['C', 7, 6], ['A', 7, 7], ['T', 7, 8]]) });
    expect(h.snapshot('b').lastTurn).toMatchObject({ kind: 'play', seatId: '1', total: 10 });
  });

  it('frees the seat on disconnect when no game is running', async () => {
    await h.seat('a');
    await h.seat('b');
    await h.disconnect('b');
    expect(h.snapshot('a').seats[1]!.occupied).toBe(false);
  });

  it('lets the others remove an away player only after 24 hours', async () => {
    await startRigged();
    const tokenC = await h.seat('c');
    await h.disconnect('c');
    await h.send('a', { action: 'remove_player', seatToken: tokenA, seatId: '3' });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'away_too_recent' });
    await h.send('a', { action: 'remove_player', seatToken: tokenA, seatId: '2' });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'player_not_away' });
    await h.send('a', { action: 'remove_player', seatToken: tokenA, seatId: '1' });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'invalid_seat' });

    h.advance(24 * 60 * 60 * 1000);
    const bagBefore = h.store.tables.get(TABLE_ID)!.game.bag.length;
    await h.send('b', { action: 'remove_player', seatToken: tokenB, seatId: '3' });
    const seen = h.snapshot('a');
    expect(seen.status).toBe('playing');
    expect(seen.seats[2]!.occupied).toBe(false);
    expect(seen.bagCount).toBe(bagBefore + 7);

    await h.connect('c2');
    await h.send('c2', { action: 'join_table', tableId: TABLE_ID });
    await h.send('c2', { action: 'resume', seatToken: tokenC });
    expect(h.lastError('c2')).toEqual({ type: 'error', code: 'invalid_seat_token' });
  });

  it('ends a two-player game when the away player is removed', async () => {
    await startRigged();
    await h.disconnect('a');
    h.advance(25 * 60 * 60 * 1000);
    await h.send('b', { action: 'remove_player', seatToken: tokenB, seatId: '1' });
    expect(h.snapshot('b')).toMatchObject({ status: 'ended', endReason: 'abandoned' });
  });

  it('frees seats still held for away players when the next game starts', async () => {
    await startRigged();
    await h.seat('c');
    await h.disconnect('c');
    h.rigGame((table) => {
      table.game.status = 'ended';
      table.game.currentSeatId = null;
    });
    await h.send('a', { action: 'start_game', seatToken: tokenA });
    const seen = h.snapshot('a');
    expect(seen.status).toBe('playing');
    expect(seen.seats.map((s) => s.occupied)).toEqual([true, true, false, false]);
    expect(h.store.tables.get(TABLE_ID)!.game.turnOrder).toEqual(['1', '2']);
  });

  it('numbers each game so a new game’s turns never look like old ones', async () => {
    await startRigged();
    expect(h.snapshot('a').gameNumber).toBe(1);
    h.rigGame((table) => {
      table.game.status = 'ended';
    });
    await h.send('b', { action: 'start_game', seatToken: tokenB });
    expect(h.snapshot('a')).toMatchObject({ gameNumber: 2, turnNumber: 0, lastTurn: null });
  });
});

describe('word check', () => {
  it('answers which words are in the list without needing a seat', async () => {
    await h.connect('w');
    await h.send('w', { action: 'join_table', tableId: TABLE_ID });
    await h.send('w', { action: 'check_words', words: ['cat', 'QZX'] });
    expect(h.last('w', 'word_check').words).toEqual([
      { text: 'CAT', valid: true },
      { text: 'QZX', valid: false },
    ]);
  });

  it('refuses lookups that are not plausible plays', async () => {
    await h.connect('w');
    await h.send('w', { action: 'join_table', tableId: TABLE_ID });
    for (const words of [[], ['A'], ['C4T'], Array.from({ length: 9 }, () => 'CAT'), 'CAT']) {
      await h.send('w', { action: 'check_words', words });
      expect(h.lastError('w')).toEqual({ type: 'error', code: 'invalid_words' });
    }
  });
});
