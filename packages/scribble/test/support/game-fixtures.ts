import { emptyGame, type GameState } from '../../src/rules/game.js';
import type { BoardTile, Placement, Tile } from '../../src/rules/types.js';

/** `?` is a blank. Ids are `<prefix>-<index>` so tests can find them. */
export function tiles(letters: string, prefix: string): Tile[] {
  return [...letters].map((ch, i) => ({ id: `${prefix}-${i}`, letter: ch === '?' ? null : ch }));
}

/** Lays a word on the board as already-committed tiles. */
export function word(text: string, row: number, col: number, dir: 'across' | 'down' = 'across'): BoardTile[] {
  return [...text].map((letter, i) => ({
    row: dir === 'across' ? row : row + i,
    col: dir === 'across' ? col + i : col,
    letter,
    blank: false,
    tileId: `board-${row}-${col}-${i}`,
  }));
}

export function game(options: {
  board?: BoardTile[];
  racks: Record<string, string>;
  bag?: string;
  current?: string;
  scores?: Record<string, number>;
}): GameState {
  const seatIds = Object.keys(options.racks);
  const players: GameState['players'] = {};
  for (const seatId of seatIds) {
    players[seatId] = { rack: tiles(options.racks[seatId]!, seatId), score: options.scores?.[seatId] ?? 0 };
  }
  return {
    ...emptyGame(),
    status: 'playing',
    board: options.board ?? [],
    bag: tiles(options.bag ?? 'EEEEEEEEEEEEEEEEEEEE', 'bag'),
    players,
    turnOrder: seatIds,
    currentSeatId: options.current ?? seatIds[0]!,
  };
}

/**
 * Builds placements from the seat's rack: `[row, col, 'A']` takes an A tile, `[row, col, '?C']` takes a blank as C.
 */
export function place(state: GameState, seatId: string, moves: Array<[number, number, string]>): Placement[] {
  const used = new Set<string>();
  return moves.map(([row, col, spec]) => {
    const blank = spec.startsWith('?');
    const tile = state.players[seatId]!.rack.find(
      (t) => !used.has(t.id) && (blank ? t.letter === null : t.letter === spec),
    );
    if (!tile) {
      throw new Error(`no ${spec} on ${seatId}'s rack`);
    }
    used.add(tile.id);
    return blank ? { tileId: tile.id, row, col, letter: spec.slice(1) } : { tileId: tile.id, row, col };
  });
}

export function across(row: number, col: number, letters: string): Array<[number, number, string]> {
  return [...letters].map((letter, i) => [row, col + i, letter]);
}
