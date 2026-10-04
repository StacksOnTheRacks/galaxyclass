import type { BoardTile, Premium } from './types.js';

export const BOARD_SIZE = 15;
export const CENTER = 7;

/** Premium squares in the top-left quadrant (rows and cols 0..7); the board mirrors them on both axes. */
const QUADRANT: ReadonlyArray<readonly [number, number, Premium]> = [
  [0, 0, 'TW'], [0, 7, 'TW'], [7, 0, 'TW'],
  [1, 1, 'DW'], [2, 2, 'DW'], [3, 3, 'DW'], [4, 4, 'DW'], [7, 7, 'DW'],
  [1, 5, 'TL'], [5, 1, 'TL'], [5, 5, 'TL'],
  [0, 3, 'DL'], [2, 6, 'DL'], [3, 0, 'DL'], [3, 7, 'DL'], [6, 2, 'DL'], [6, 6, 'DL'], [7, 3, 'DL'],
];

function buildPremiumMap(): ReadonlyMap<string, Premium> {
  const map = new Map<string, Premium>();
  const last = BOARD_SIZE - 1;
  for (const [row, col, premium] of QUADRANT) {
    for (const [r, c] of [
      [row, col],
      [row, last - col],
      [last - row, col],
      [last - row, last - col],
    ] as const) {
      map.set(squareKey(r, c), premium);
    }
  }
  return map;
}

export function squareKey(row: number, col: number): string {
  return `${row},${col}`;
}

export const PREMIUMS: ReadonlyMap<string, Premium> = buildPremiumMap();

export function premiumAt(row: number, col: number): Premium | null {
  return PREMIUMS.get(squareKey(row, col)) ?? null;
}

export function onBoard(row: number, col: number): boolean {
  return (
    Number.isInteger(row) && Number.isInteger(col) && row >= 0 && col >= 0 && row < BOARD_SIZE && col < BOARD_SIZE
  );
}

export function indexBoard(board: ReadonlyArray<BoardTile>): Map<string, BoardTile> {
  return new Map(board.map((tile) => [squareKey(tile.row, tile.col), tile]));
}
