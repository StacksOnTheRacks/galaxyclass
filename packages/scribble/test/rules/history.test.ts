import { describe, expect, it } from 'vitest';
import { seededRandom } from '../../src/rules/bag.js';
import { loadDictionary } from '../../src/rules/dictionary.js';
import { applyExchange, applyPass, applyPlay, removePlayer, type GameState, type TurnResult } from '../../src/rules/game.js';
import { across, game, place, word } from '../support/game-fixtures.js';

const dictionary = loadDictionary();

function played(result: TurnResult): GameState {
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  }
  return result.state;
}

function play(state: GameState, seat: string, moves: Array<[number, number, string]>): GameState {
  return played(applyPlay(state, seat, place(state, seat, moves), dictionary));
}

describe('turn history', () => {
  it('records each play with its words, tiles, premiums, and the running score', () => {
    const state = play(game({ racks: { a: 'QUARTEE', b: 'E' } }), 'a', across(7, 3, 'QUART'));
    expect(state.history).toEqual([
      {
        turnNumber: 1,
        seatId: 'a',
        kind: 'play',
        words: [{ text: 'QUART', score: 48 }],
        tiles: 5,
        blanks: 0,
        premiums: ['DL', 'DW'],
        total: 48,
        bingo: false,
        exchanged: 0,
        score: 48,
      },
    ]);
  });

  it('counts a premium square once even when it scores two words', () => {
    const board = [...word('T', 2, 3), ...word('T', 3, 2)];
    const state = play(game({ board, racks: { a: 'A', b: 'E' } }), 'a', [[2, 2, 'A']]);
    expect(state.history[0]).toMatchObject({ words: [{ text: 'AT' }, { text: 'AT' }], premiums: ['DW'], total: 8 });
  });

  it('marks bingos and blanks', () => {
    const state = play(game({ racks: { a: 'RETAIN?', b: 'E' } }), 'a', [...across(7, 7, 'RETAIN'), [7, 13, '?S']]);
    expect(state.history[0]).toMatchObject({ tiles: 7, blanks: 1, bingo: true, words: [{ text: 'RETAINS' }] });
  });

  it('records passes and exchanges at the seat’s unchanged score', () => {
    let state = game({ racks: { a: 'CATDOGS', b: 'EEEEEEE' }, scores: { a: 0, b: 12 } });
    state = play(state, 'a', across(7, 6, 'CAT'));
    state = played(applyPass(state, 'b'));
    state = played(applyExchange(state, 'a', [state.players.a!.rack[0]!.id], seededRandom(1)));
    expect(state.history.map(({ turnNumber, seatId, kind, total, exchanged, score }) => ({ turnNumber, seatId, kind, total, exchanged, score }))).toEqual([
      { turnNumber: 1, seatId: 'a', kind: 'play', total: 10, exchanged: 0, score: 10 },
      { turnNumber: 2, seatId: 'b', kind: 'pass', total: 0, exchanged: 0, score: 12 },
      { turnNumber: 3, seatId: 'a', kind: 'exchange', total: 0, exchanged: 1, score: 10 },
    ]);
  });

  it('records the auto-pass of a player who leaves on their turn', () => {
    const next = removePlayer(game({ racks: { a: 'QZ', b: 'AE', c: 'IO' } }), 'a', seededRandom(3));
    expect(next.history).toEqual([expect.objectContaining({ seatId: 'a', kind: 'auto_pass', score: 0 })]);
  });
});

describe('final scores', () => {
  it('keeps the settled scores of everyone still playing', () => {
    const state = game({ board: word('CAT', 7, 6), racks: { a: 'S', b: 'QZ', c: 'AE' }, bag: '', scores: { a: 100, b: 100, c: 100 } });
    const next = play(state, 'a', [[7, 9, 'S']]);
    expect(next.finalScores).toEqual({ a: 128, b: 80, c: 98 });
    expect(next.history.at(-1)).toMatchObject({ seatId: 'a', score: 106 });
  });

  it('keeps the remaining scores when a game is abandoned', () => {
    const next = removePlayer(game({ racks: { a: 'QZ', b: 'AE' }, scores: { a: 30, b: 12 } }), 'b', seededRandom(3));
    expect(next.status).toBe('ended');
    expect(next.finalScores).toEqual({ a: 30 });
  });

  it('survives a player leaving after the game has ended', () => {
    let state = game({ racks: { a: 'QZ', b: 'AE' } });
    for (let i = 0; i < 6; i++) {
      state = played(applyPass(state, state.currentSeatId!));
    }
    const after = removePlayer(state, 'b', seededRandom(3));
    expect(after.players.b).toBeUndefined();
    expect(after.finalScores).toEqual({ a: -20, b: -2 });
    expect(after.history).toHaveLength(6);
  });
});
