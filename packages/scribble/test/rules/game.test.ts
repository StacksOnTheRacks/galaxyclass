import { describe, expect, it } from 'vitest';
import { seededRandom } from '../../src/rules/bag.js';
import { loadDictionary } from '../../src/rules/dictionary.js';
import {
  addPlayer,
  applyExchange,
  applyPass,
  applyPlay,
  removePlayer,
  startGame,
  type GameState,
  type TurnResult,
} from '../../src/rules/game.js';
import type { ScoreBeat } from '../../src/rules/types.js';
import { across, game, place, word } from '../support/game-fixtures.js';

const dictionary = loadDictionary();

function played(result: TurnResult): GameState {
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  }
  return result.state;
}

function play(state: GameState, seat: string, moves: Array<[number, number, string]>): TurnResult {
  return applyPlay(state, seat, place(state, seat, moves), dictionary);
}

const kinds = (beats: ScoreBeat[]) => beats.map((beat) => (beat.kind === 'tile' ? `${beat.letter}${beat.value}` : beat.kind));

describe('dictionary check', () => {
  it('rejects a word that is not in the list and leaves the game untouched', () => {
    const state = game({ racks: { a: 'QZXAEIO', b: 'EEEEEEE' } });
    const result = play(state, 'a', across(7, 6, 'QZX'));
    expect(result).toEqual({ ok: false, code: 'invalid_word', words: ['QZX'] });
  });

  it('rejects a valid main word with an invalid cross-word', () => {
    const state = game({ board: word('CAT', 7, 6), racks: { a: 'OX', b: 'E' } });
    expect(play(state, 'a', across(8, 7, 'OX'))).toEqual({ ok: false, code: 'invalid_word', words: ['AO', 'TX'] });
  });

  it('reports placement problems before the dictionary', () => {
    const state = game({ racks: { a: 'CAT', b: 'E' } });
    expect(play(state, 'a', across(0, 0, 'CAT'))).toEqual({
      ok: false,
      code: 'invalid_placement',
      reason: 'must_cover_center',
    });
  });
});

describe('premium math', () => {
  it('doubles the first word through the center', () => {
    const state = played(play(game({ racks: { a: 'CATDOGS', b: 'E' } }), 'a', across(7, 6, 'CAT')));
    expect(state.players.a!.score).toBe(10);
    expect(kinds(state.lastTurn!.beats)).toEqual(['C3', 'A1', 'T1', 'word_premium', 'word', 'total']);
  });

  it('doubles a letter on a double-letter square', () => {
    const state = played(play(game({ racks: { a: 'QUARTEE', b: 'E' } }), 'a', across(7, 3, 'QUART')));
    expect(state.players.a!.score).toBe(48);
    const premium = state.lastTurn!.beats.find((beat) => beat.kind === 'letter_premium');
    expect(premium).toMatchObject({ premium: 'DL', row: 7, col: 3, add: 10, running: 24 });
  });

  it('triples a letter on a triple-letter square', () => {
    const state = game({ board: word('A', 5, 4), racks: { a: 'X', b: 'E' } });
    const next = played(play(state, 'a', [[5, 5, 'X']]));
    expect(next.lastTurn!.total).toBe(25);
    expect(next.lastTurn!.beats.find((beat) => beat.kind === 'letter_premium')).toMatchObject({ premium: 'TL', add: 16 });
  });

  it('triples a word on a triple-word square', () => {
    const state = game({ board: word('O', 0, 1), racks: { a: 'BX', b: 'E' } });
    const next = played(play(state, 'a', [[0, 0, 'B'], [0, 2, 'X']]));
    expect(next.lastTurn!.total).toBe(36);
    expect(next.lastTurn!.beats.find((beat) => beat.kind === 'word_premium')).toMatchObject({
      premium: 'TW',
      multiplier: 3,
      running: 36,
    });
  });

  it('applies a new tile’s word premium to both words it forms', () => {
    const board = [...word('T', 2, 3), ...word('T', 3, 2)];
    const next = played(play(game({ board, racks: { a: 'A', b: 'E' } }), 'a', [[2, 2, 'A']]));
    expect(next.lastTurn!.words).toEqual([
      { text: 'AT', cells: [{ row: 2, col: 2 }, { row: 2, col: 3 }], score: 4 },
      { text: 'AT', cells: [{ row: 2, col: 2 }, { row: 3, col: 2 }], score: 4 },
    ]);
    expect(next.lastTurn!.total).toBe(8);
    expect(next.lastTurn!.beats.filter((beat) => beat.kind === 'word_premium')).toHaveLength(2);
  });

  it('scores a premium only on the turn its tile is placed', () => {
    const state = game({ board: word('CAT', 7, 6), racks: { a: 'S', b: 'E' } });
    const next = played(play(state, 'a', [[7, 9, 'S']]));
    expect(next.lastTurn!.total).toBe(6);
    expect(next.lastTurn!.beats.some((beat) => beat.kind === 'word_premium' || beat.kind === 'letter_premium')).toBe(false);
  });

  it('counts existing cross-word tiles so the beats add up', () => {
    const state = game({ board: word('CAT', 7, 6), racks: { a: 'SH', b: 'E' } });
    const next = played(play(state, 'a', [[8, 9, 'H'], [7, 9, 'S']]));
    const beats = next.lastTurn!.beats;
    const last = beats.at(-1)!;
    expect(last).toMatchObject({ kind: 'total', total: next.lastTurn!.total, score: next.players.a!.score });
    const runningBeforeTotal = beats.at(-2)! as { running: number };
    expect(runningBeforeTotal.running).toBe(next.lastTurn!.total);
  });
});

describe('fifty-point bonus', () => {
  it('adds 50 when all seven tiles are played', () => {
    const state = played(play(game({ racks: { a: 'RETAINS', b: 'E' } }), 'a', across(7, 7, 'RETAINS')));
    expect(state.lastTurn!.bingo).toBe(true);
    expect(state.lastTurn!.total).toBe(66);
    expect(state.lastTurn!.beats.at(-2)).toEqual({ kind: 'bingo', add: 50, running: 66 });
    expect(state.players.a!.rack).toHaveLength(7);
  });

  it('does not add 50 for six tiles', () => {
    const state = played(play(game({ racks: { a: 'RETAINS', b: 'E' } }), 'a', across(7, 7, 'RETAIN')));
    expect(state.lastTurn!.bingo).toBe(false);
    expect(state.lastTurn!.beats.some((beat) => beat.kind === 'bingo')).toBe(false);
  });
});

describe('blanks', () => {
  it('scores zero and keeps the chosen letter once committed', () => {
    const start = game({ racks: { a: '?ATDOGS', b: 'SEEEEEE' } });
    const first = played(play(start, 'a', [[7, 6, '?C'], [7, 7, 'A'], [7, 8, 'T']]));
    expect(first.lastTurn!.total).toBe(4);
    expect(first.board.find((t) => t.col === 6)).toMatchObject({ letter: 'C', blank: true });

    const second = played(play(first, 'b', [[7, 9, 'S']]));
    expect(second.lastTurn!.words[0]!.text).toBe('CATS');
    expect(second.lastTurn!.total).toBe(3);
    expect(second.board.find((t) => t.col === 6)).toMatchObject({ letter: 'C', blank: true });
  });

  it('cannot be re-lettered by a later play', () => {
    const start = game({ racks: { a: '?ATDOGS', b: 'SEEEEEE' } });
    const first = played(play(start, 'a', [[7, 6, '?C'], [7, 7, 'A'], [7, 8, 'T']]));
    const blankId = first.board.find((t) => t.blank)!.tileId;
    expect(applyPlay(first, 'b', [{ tileId: blankId, row: 8, col: 6, letter: 'B' }], dictionary)).toMatchObject({
      ok: false,
      reason: 'not_your_tile',
    });
  });
});

describe('turns', () => {
  it('refuses plays out of turn and before the game starts', () => {
    const state = game({ racks: { a: 'CAT', b: 'DOG' } });
    expect(play(state, 'b', across(7, 6, 'DOG'))).toEqual({ ok: false, code: 'off_turn' });
    expect(applyPass({ ...state, status: 'waiting' }, 'a')).toEqual({ ok: false, code: 'game_not_in_progress' });
  });

  it('refills the rack and hands the turn on', () => {
    const state = played(play(game({ racks: { a: 'CATDOGS', b: 'E' }, bag: 'XYZ' }), 'a', across(7, 6, 'CAT')));
    expect(state.players.a!.rack.map((t) => t.letter)).toEqual(['D', 'O', 'G', 'S', 'X', 'Y', 'Z']);
    expect(state.bag).toHaveLength(0);
    expect(state.currentSeatId).toBe('b');
  });

  it('exchanges only when the bag holds at least seven tiles', () => {
    const six = game({ racks: { a: 'QQQ', b: 'E' }, bag: 'EEEEEE' });
    const ids = six.players.a!.rack.map((t) => t.id);
    expect(applyExchange(six, 'a', ids, seededRandom(1))).toEqual({ ok: false, code: 'exchange_unavailable' });

    const seven = game({ racks: { a: 'QQQ', b: 'E' }, bag: 'EEEEEEE' });
    const next = played(applyExchange(seven, 'a', ids, seededRandom(1)));
    expect(next.players.a!.rack.map((t) => t.letter)).toEqual(['E', 'E', 'E']);
    expect(next.bag).toHaveLength(7);
    expect(next.bag.filter((t) => t.letter === 'Q')).toHaveLength(3);
    expect(next.lastTurn).toMatchObject({ kind: 'exchange', exchanged: 3, total: 0 });
    expect(next.scorelessTurns).toBe(1);
  });

  it('rejects exchanging tiles you do not hold', () => {
    const state = game({ racks: { a: 'QQQ', b: 'E' } });
    expect(applyExchange(state, 'a', ['nope'], seededRandom(1))).toEqual({ ok: false, code: 'invalid_exchange' });
    expect(applyExchange(state, 'a', [], seededRandom(1))).toEqual({ ok: false, code: 'invalid_exchange' });
  });

  it('deals seven tiles each and picks a first player when the game starts', () => {
    const state = startGame(['1', '2', '3'], seededRandom(9))!;
    expect(Object.values(state.players).map((p) => p.rack.length)).toEqual([7, 7, 7]);
    expect(state.bag).toHaveLength(79);
    expect(['1', '2', '3']).toContain(state.currentSeatId);
    expect(startGame(['1'], seededRandom(9))).toBeNull();
    expect(startGame(['1', '2', '3', '4', '5'], seededRandom(9))).toBeNull();
  });
});

describe('end of game', () => {
  it('ends after six consecutive scoreless turns and subtracts each rack', () => {
    let state = game({ racks: { a: 'QZ', b: 'AE' } });
    for (let i = 0; i < 5; i++) {
      state = played(applyPass(state, state.currentSeatId!));
      expect(state.status).toBe('playing');
    }
    state = played(applyPass(state, state.currentSeatId!));
    expect(state.status).toBe('ended');
    expect(state.endReason).toBe('scoreless_turns');
    expect(state.finalAdjustments).toEqual({ a: -20, b: -2 });
    expect(state.players.a!.score).toBe(-20);
    expect(state.players.b!.score).toBe(-2);
  });

  it('resets the scoreless count after a scoring play', () => {
    let state = game({ racks: { a: 'CATDOGS', b: 'EEEEEEE' } });
    state = played(applyPass(state, 'a'));
    state = played(applyPass(state, 'b'));
    state = played(play(state, 'a', across(7, 6, 'CAT')));
    expect(state.scorelessTurns).toBe(0);
  });

  it('gives the player who went out everyone else’s leftovers', () => {
    const state = game({
      board: word('CAT', 7, 6),
      racks: { a: 'S', b: 'QZ', c: 'AE' },
      bag: '',
      scores: { a: 100, b: 100, c: 100 },
    });
    const next = played(play(state, 'a', [[7, 9, 'S']]));
    expect(next.status).toBe('ended');
    expect(next.endReason).toBe('played_out');
    expect(next.wentOutSeatId).toBe('a');
    expect(next.finalAdjustments).toEqual({ a: 22, b: -20, c: -2 });
    expect(next.players.a!.score).toBe(100 + 6 + 22);
    expect(next.players.b!.score).toBe(80);
    expect(next.players.c!.score).toBe(98);
  });

  it('does not end when the rack empties while tiles remain in the bag', () => {
    const state = game({ board: word('CAT', 7, 6), racks: { a: 'S', b: 'E' }, bag: 'E' });
    expect(played(play(state, 'a', [[7, 9, 'S']])).status).toBe('playing');
  });
});

describe('joining and leaving mid-game', () => {
  it('auto-passes for a player who leaves on their turn and returns their rack', () => {
    const state = game({ racks: { a: 'QZ', b: 'AE', c: 'IO' }, bag: 'E' });
    const next = removePlayer(state, 'a', seededRandom(3));
    expect(next.status).toBe('playing');
    expect(next.lastTurn).toMatchObject({ kind: 'auto_pass', seatId: 'a' });
    expect(next.scorelessTurns).toBe(1);
    expect(next.currentSeatId).toBe('b');
    expect(next.players.a).toBeUndefined();
    expect(next.bag.map((t) => t.letter).sort()).toEqual(['E', 'Q', 'Z']);
  });

  it('drops a player between turns without a pass', () => {
    const state = game({ racks: { a: 'QZ', b: 'AE', c: 'IO' } });
    const next = removePlayer(state, 'b', seededRandom(3));
    expect(next.lastTurn).toBeNull();
    expect(next.currentSeatId).toBe('a');
    expect(next.turnOrder).toEqual(['a', 'c']);
  });

  it('abandons the game when fewer than two players remain', () => {
    const next = removePlayer(game({ racks: { a: 'QZ', b: 'AE' } }), 'b', seededRandom(3));
    expect(next.status).toBe('ended');
    expect(next.endReason).toBe('abandoned');
    expect(next.finalAdjustments).toBeNull();
  });

  it('deals a late sitter seven tiles at the end of the turn order', () => {
    const next = addPlayer(game({ racks: { a: 'QZ', b: 'AE' } }), 'c');
    expect(next.turnOrder).toEqual(['a', 'b', 'c']);
    expect(next.players.c!.rack).toHaveLength(7);
    expect(next.players.c!.score).toBe(0);
  });
});
