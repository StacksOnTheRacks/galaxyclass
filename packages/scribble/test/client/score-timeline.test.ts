import { describe, expect, it } from 'vitest';
import { buildTimeline, timelineDuration } from '../../src/client/score-timeline.js';
import { loadDictionary } from '../../src/rules/dictionary.js';
import { applyPlay, type LastTurn } from '../../src/rules/game.js';
import { across, game, place, word } from '../support/game-fixtures.js';

const dictionary = loadDictionary();

function lastTurnOf(result: ReturnType<typeof applyPlay>): LastTurn {
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result.state.lastTurn!;
}

describe('score timeline', () => {
  it('counts face values, then each premium on its own, then the word, the 50, and the total', () => {
    const state = game({ racks: { a: 'RETAINS', b: 'EEEEEEE' } });
    const turn = lastTurnOf(applyPlay(state, 'a', place(state, 'a', across(7, 3, 'RETAINS')), dictionary));
    const steps = buildTimeline(turn);
    expect(steps.map((s) => s.kind)).toEqual([
      'highlight',
      'tile', 'tile', 'tile', 'tile', 'tile', 'tile', 'tile',
      'premium',
      'premium',
      'word',
      'bingo',
      'total',
    ]);
    expect(steps.slice(8, 13).map((s) => ('label' in s ? s.label : ''))).toEqual([
      '2× letter +1',
      '2× word ×2',
      'RETAINS 16',
      'All seven +50',
      '+66',
    ]);
    const premiums = steps.filter((s) => s.kind === 'premium');
    expect(premiums.map((s) => [s.row, s.col])).toEqual([
      [7, 3],
      [7, 7],
    ]);
    expect(steps.at(-1)).toMatchObject({ kind: 'total', total: 66, score: 66, seatId: 'a' });
  });

  it('highlights every scoring tile once, including the old tiles in a cross-word', () => {
    const state = game({ board: word('AT', 7, 7), racks: { a: 'NO', b: 'E' } });
    const turn = lastTurnOf(
      applyPlay(state, 'a', [{ tileId: 'a-0', row: 8, col: 7 }, { tileId: 'a-1', row: 8, col: 8 }], dictionary),
    );
    const highlight = buildTimeline(turn)[0]!;
    expect(highlight.kind).toBe('highlight');
    if (highlight.kind === 'highlight') {
      expect(highlight.words.sort()).toEqual(['AN', 'NO', 'TO']);
      expect(highlight.cells).toHaveLength(4);
    }
  });

  it('is empty for passes and exchanges, and shorter with reduced motion', () => {
    const pass = { kind: 'pass' } as LastTurn;
    expect(buildTimeline(pass)).toEqual([]);
    const state = game({ racks: { a: 'CAT', b: 'E' } });
    const turn = lastTurnOf(applyPlay(state, 'a', place(state, 'a', across(7, 6, 'CAT')), dictionary));
    expect(timelineDuration(buildTimeline(turn, { reducedMotion: true }))).toBeLessThan(timelineDuration(buildTimeline(turn)) / 2);
  });
});
