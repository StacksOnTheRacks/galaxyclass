import { describe, expect, it } from 'vitest';
import { createBag, seededRandom } from '../../src/rules/bag.js';
import { BOARD_SIZE, CENTER, PREMIUMS, premiumAt } from '../../src/rules/board.js';
import { LETTER_VALUES, TILE_COUNTS, tileValue } from '../../src/rules/tiles.js';

describe('tile set', () => {
  it('has 100 tiles including two blanks', () => {
    const total = TILE_COUNTS.reduce((sum, [, count]) => sum + count, 0);
    expect(total).toBe(100);
    expect(TILE_COUNTS.find(([letter]) => letter === null)?.[1]).toBe(2);
  });

  it('uses the standard letter values', () => {
    expect(LETTER_VALUES).toMatchObject({ A: 1, D: 2, B: 3, F: 4, K: 5, J: 8, X: 8, Q: 10, Z: 10 });
    expect(Object.keys(LETTER_VALUES)).toHaveLength(26);
  });

  it('scores blanks as zero', () => {
    expect(tileValue({ letter: null })).toBe(0);
    expect(tileValue({ letter: 'Z', blank: true })).toBe(0);
    expect(tileValue({ letter: 'Z' })).toBe(10);
  });

  it('builds a shuffled bag with unique opaque ids', () => {
    const bag = createBag(seededRandom(7));
    expect(bag).toHaveLength(100);
    expect(new Set(bag.map((tile) => tile.id)).size).toBe(100);
    expect(bag.filter((tile) => tile.letter === 'E')).toHaveLength(12);
  });
});

describe('premium layout', () => {
  const count = (kind: string) => [...PREMIUMS.values()].filter((p) => p === kind).length;

  it('has the standard counts on a 15x15 board', () => {
    expect(BOARD_SIZE).toBe(15);
    expect(count('TW')).toBe(8);
    expect(count('DW')).toBe(17);
    expect(count('TL')).toBe(12);
    expect(count('DL')).toBe(24);
  });

  it('makes the center a double word', () => {
    expect(premiumAt(CENTER, CENTER)).toBe('DW');
  });

  it('is symmetric on both axes', () => {
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        expect(premiumAt(r, c)).toBe(premiumAt(14 - r, c));
        expect(premiumAt(r, c)).toBe(premiumAt(r, 14 - c));
        expect(premiumAt(r, c)).toBe(premiumAt(c, r));
      }
    }
  });

  it('places corner and edge premiums where the standard board does', () => {
    expect(premiumAt(0, 0)).toBe('TW');
    expect(premiumAt(0, 3)).toBe('DL');
    expect(premiumAt(1, 5)).toBe('TL');
    expect(premiumAt(1, 1)).toBe('DW');
    expect(premiumAt(7, 3)).toBe('DL');
    expect(premiumAt(0, 1)).toBeNull();
  });
});
