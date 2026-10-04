import { CENTER, indexBoard, onBoard, premiumAt, squareKey } from './board.js';
import { isLetter, RACK_SIZE, tileValue } from './tiles.js';
import type { BoardTile, FormedWord, Placement, PlacementError, Tile, WordCell } from './types.js';

export type PlacementResult =
  | { ok: true; placed: BoardTile[]; words: FormedWord[]; rackAfter: Tile[] }
  | { ok: false; reason: PlacementError };

type Axis = 'row' | 'col';

/**
 * Checks a proposed play against the board and the player's own rack, then returns every word it forms.
 * Dictionary membership is checked separately so this stays a pure geometry check.
 */
export function checkPlacement(
  board: ReadonlyArray<BoardTile>,
  rack: ReadonlyArray<Tile>,
  placements: ReadonlyArray<Placement>,
): PlacementResult {
  if (placements.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  if (placements.length > RACK_SIZE) {
    return { ok: false, reason: 'too_many_tiles' };
  }

  const occupied = indexBoard(board);
  const rackById = new Map(rack.map((tile) => [tile.id, tile]));
  const usedTiles = new Set<string>();
  const usedSquares = new Set<string>();
  const placed: BoardTile[] = [];

  for (const placement of placements) {
    if (usedTiles.has(placement.tileId)) {
      return { ok: false, reason: 'duplicate_tile' };
    }
    usedTiles.add(placement.tileId);
    const tile = rackById.get(placement.tileId);
    if (!tile) {
      return { ok: false, reason: 'not_your_tile' };
    }
    if (!onBoard(placement.row, placement.col)) {
      return { ok: false, reason: 'off_board' };
    }
    const key = squareKey(placement.row, placement.col);
    if (occupied.has(key)) {
      return { ok: false, reason: 'occupied' };
    }
    if (usedSquares.has(key)) {
      return { ok: false, reason: 'duplicate_square' };
    }
    usedSquares.add(key);

    let letter: string;
    if (tile.letter === null) {
      const chosen = typeof placement.letter === 'string' ? placement.letter.toUpperCase() : undefined;
      if (chosen === undefined) {
        return { ok: false, reason: 'blank_letter_required' };
      }
      if (!isLetter(chosen)) {
        return { ok: false, reason: 'invalid_letter' };
      }
      letter = chosen;
    } else {
      if (placement.letter !== undefined) {
        return { ok: false, reason: 'invalid_letter' };
      }
      letter = tile.letter;
    }
    placed.push({ row: placement.row, col: placement.col, letter, blank: tile.letter === null, tileId: tile.id });
  }

  const sameRow = placed.every((tile) => tile.row === placed[0]!.row);
  const sameCol = placed.every((tile) => tile.col === placed[0]!.col);
  if (!sameRow && !sameCol) {
    return { ok: false, reason: 'not_in_line' };
  }

  const newByKey = new Map(placed.map((tile) => [squareKey(tile.row, tile.col), tile]));
  const all = new Map([...occupied, ...newByKey]);

  let axis: Axis;
  if (placed.length > 1) {
    axis = sameRow ? 'row' : 'col';
  } else {
    const only = placed[0]!;
    const hasRowNeighbor = all.has(squareKey(only.row, only.col - 1)) || all.has(squareKey(only.row, only.col + 1));
    axis = hasRowNeighbor ? 'row' : 'col';
  }

  const fixed = axis === 'row' ? placed[0]!.row : placed[0]!.col;
  const along = placed.map((tile) => (axis === 'row' ? tile.col : tile.row));
  const min = Math.min(...along);
  const max = Math.max(...along);
  for (let i = min; i <= max; i++) {
    const key = axis === 'row' ? squareKey(fixed, i) : squareKey(i, fixed);
    if (!all.has(key)) {
      return { ok: false, reason: 'gap' };
    }
  }

  const firstPlay = board.length === 0;
  if (firstPlay) {
    if (!newByKey.has(squareKey(CENTER, CENTER))) {
      return { ok: false, reason: 'must_cover_center' };
    }
    if (placed.length < 2) {
      return { ok: false, reason: 'too_short' };
    }
  }

  const words: FormedWord[] = [];
  const main = readWord(all, newByKey, placed[0]!, axis);
  if (main) {
    words.push(main);
  }
  const cross: Axis = axis === 'row' ? 'col' : 'row';
  for (const tile of placed) {
    const word = readWord(all, newByKey, tile, cross);
    if (word) {
      words.push(word);
    }
  }

  if (!firstPlay && !words.some((word) => word.cells.some((cell) => !cell.isNew))) {
    return { ok: false, reason: 'not_connected' };
  }
  if (words.length === 0) {
    return { ok: false, reason: 'too_short' };
  }

  return { ok: true, placed, words, rackAfter: rack.filter((tile) => !usedTiles.has(tile.id)) };
}

/** Reads the run of tiles through `start` along `axis`; null when it is a single letter. */
function readWord(
  all: ReadonlyMap<string, BoardTile>,
  newByKey: ReadonlyMap<string, BoardTile>,
  start: BoardTile,
  axis: Axis,
): FormedWord | null {
  const at = (i: number) => (axis === 'row' ? squareKey(start.row, i) : squareKey(i, start.col));
  let first = axis === 'row' ? start.col : start.row;
  while (all.has(at(first - 1))) {
    first--;
  }
  const cells: WordCell[] = [];
  for (let i = first; all.has(at(i)); i++) {
    const tile = all.get(at(i))!;
    const isNew = newByKey.has(at(i));
    cells.push({
      row: tile.row,
      col: tile.col,
      letter: tile.letter,
      value: tileValue(tile),
      isNew,
      premium: isNew ? premiumAt(tile.row, tile.col) : null,
    });
  }
  if (cells.length < 2) {
    return null;
  }
  return { text: cells.map((cell) => cell.letter).join(''), cells };
}
