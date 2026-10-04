import { describe, expect, it } from 'vitest';
import { checkPlacement } from '../../src/rules/placement.js';
import { across, game, place, word } from '../support/game-fixtures.js';

function reason(result: ReturnType<typeof checkPlacement>): string | null {
  return result.ok ? null : result.reason;
}

describe('placement', () => {
  const first = game({ racks: { a: 'CATSDOG', b: 'EEEEEEE' } });
  const rackA = first.players.a!.rack;

  it('accepts a first play across the center', () => {
    const result = checkPlacement([], rackA, place(first, 'a', across(7, 6, 'CAT')));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.words.map((w) => w.text)).toEqual(['CAT']);
      expect(result.rackAfter.map((t) => t.letter)).toEqual(['S', 'D', 'O', 'G']);
    }
  });

  it('requires the first play to cover the center', () => {
    expect(reason(checkPlacement([], rackA, place(first, 'a', across(3, 3, 'CAT'))))).toBe('must_cover_center');
  });

  it('requires the first play to be at least two letters', () => {
    expect(reason(checkPlacement([], rackA, place(first, 'a', [[7, 7, 'C']])))).toBe('too_short');
  });

  it('rejects tiles that are not in one line', () => {
    const moves: Array<[number, number, string]> = [[7, 7, 'C'], [8, 8, 'A']];
    expect(reason(checkPlacement([], rackA, place(first, 'a', moves)))).toBe('not_in_line');
  });

  it('rejects gaps across empty squares', () => {
    const moves: Array<[number, number, string]> = [[7, 6, 'C'], [7, 7, 'A'], [7, 9, 'T']];
    expect(reason(checkPlacement([], rackA, place(first, 'a', moves)))).toBe('gap');
  });

  it('allows a gap filled by an existing tile', () => {
    const board = word('O', 0, 1);
    const state = game({ board, racks: { a: 'BX', b: 'E' } });
    const result = checkPlacement(board, state.players.a!.rack, place(state, 'a', [[0, 0, 'B'], [0, 2, 'X']]));
    expect(result.ok && result.words[0]!.text).toBe('BOX');
  });

  it('rejects a later play that does not touch the board', () => {
    const board = word('CAT', 7, 6);
    const state = game({ board, racks: { a: 'DOG', b: 'E' } });
    expect(reason(checkPlacement(board, state.players.a!.rack, place(state, 'a', across(0, 0, 'DOG'))))).toBe(
      'not_connected',
    );
  });

  it('rejects occupied, off-board, and duplicate squares', () => {
    const board = word('CAT', 7, 6);
    const state = game({ board, racks: { a: 'DOGS', b: 'E' } });
    const rack = state.players.a!.rack;
    expect(reason(checkPlacement(board, rack, place(state, 'a', [[7, 7, 'D']])))).toBe('occupied');
    expect(reason(checkPlacement(board, rack, place(state, 'a', [[15, 7, 'D']])))).toBe('off_board');
    const [d, o] = place(state, 'a', [[8, 6, 'D'], [8, 6, 'O']]);
    expect(reason(checkPlacement(board, rack, [d!, o!]))).toBe('duplicate_square');
  });

  it('only takes tiles from your own rack, once each', () => {
    const tile = rackA[0]!;
    expect(reason(checkPlacement([], rackA, [{ tileId: 'someone-else', row: 7, col: 7 }]))).toBe('not_your_tile');
    expect(
      reason(
        checkPlacement([], rackA, [
          { tileId: tile.id, row: 7, col: 7 },
          { tileId: tile.id, row: 7, col: 8 },
        ]),
      ),
    ).toBe('duplicate_tile');
  });

  it('rejects an empty play and more than seven tiles', () => {
    expect(reason(checkPlacement([], rackA, []))).toBe('empty');
    const eight = Array.from({ length: 8 }, (_, i) => ({ tileId: `x${i}`, row: 7, col: i }));
    expect(reason(checkPlacement([], rackA, eight))).toBe('too_many_tiles');
  });

  it('needs a letter for a blank and refuses one for a lettered tile', () => {
    const state = game({ racks: { a: '?AT', b: 'E' } });
    const rack = state.players.a!.rack;
    const blank = rack.find((t) => t.letter === null)!;
    const a = rack.find((t) => t.letter === 'A')!;
    expect(
      reason(checkPlacement([], rack, [{ tileId: blank.id, row: 7, col: 6 }, { tileId: a.id, row: 7, col: 7 }])),
    ).toBe('blank_letter_required');
    expect(
      reason(
        checkPlacement([], rack, [
          { tileId: blank.id, row: 7, col: 6, letter: '7' },
          { tileId: a.id, row: 7, col: 7 },
        ]),
      ),
    ).toBe('invalid_letter');
    expect(
      reason(
        checkPlacement([], rack, [
          { tileId: blank.id, row: 7, col: 6, letter: 'c' },
          { tileId: a.id, row: 7, col: 7, letter: 'Z' },
        ]),
      ),
    ).toBe('invalid_letter');
  });

  it('finds the main word and every cross-word', () => {
    const board = word('CAT', 7, 6);
    const state = game({ board, racks: { a: 'OX', b: 'E' } });
    const result = checkPlacement(board, state.players.a!.rack, place(state, 'a', across(8, 7, 'OX')));
    expect(result.ok && result.words.map((w) => w.text)).toEqual(['OX', 'AO', 'TX']);
  });
});
