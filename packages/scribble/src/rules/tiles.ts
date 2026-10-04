/** Standard English letter values. Blanks are worth 0. */
export const LETTER_VALUES: Readonly<Record<string, number>> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

/** Standard 100-tile English distribution. `null` is a blank. */
export const TILE_COUNTS: ReadonlyArray<readonly [string | null, number]> = [
  ['A', 9], ['B', 2], ['C', 2], ['D', 4], ['E', 12], ['F', 2], ['G', 3], ['H', 2], ['I', 9],
  ['J', 1], ['K', 1], ['L', 4], ['M', 2], ['N', 6], ['O', 8], ['P', 2], ['Q', 1], ['R', 6],
  ['S', 4], ['T', 6], ['U', 4], ['V', 2], ['W', 2], ['X', 1], ['Y', 2], ['Z', 1], [null, 2],
];

export const RACK_SIZE = 7;
export const BINGO_BONUS = 50;

export function isLetter(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]$/.test(value);
}

/** Face value of a rack or board tile: a blank scores 0 whatever letter it stands for. */
export function tileValue(tile: { letter: string | null; blank?: boolean }): number {
  if (tile.blank || tile.letter === null) {
    return 0;
  }
  return LETTER_VALUES[tile.letter] ?? 0;
}

export function rackValue(rack: ReadonlyArray<{ letter: string | null }>): number {
  return rack.reduce((sum, tile) => sum + tileValue(tile), 0);
}
