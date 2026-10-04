import type { Random } from '../rules/bag.js';
import type { Placement, Tile } from '../rules/types.js';

/**
 * The tiles a player has set down but not committed. Purely local: nothing here is sent
 * until Play, and then only tile ids, squares, and the letters chosen for blanks.
 */
export interface Draft {
  /** Rack tile ids in the order the player arranged them, placed ones included. */
  order: string[];
  placed: Record<string, { row: number; col: number; letter: string | null }>;
}

export const EMPTY_DRAFT: Draft = { order: [], placed: {} };

type Occupied = (row: number, col: number) => boolean;

/** Reconciles with a fresh snapshot: new tiles join the rack, gone tiles and covered squares drop. */
export function syncDraft(draft: Draft, rack: ReadonlyArray<Tile>, occupied: Occupied): Draft {
  const ids = new Set(rack.map((tile) => tile.id));
  const order = draft.order.filter((id) => ids.has(id));
  for (const tile of rack) {
    if (!order.includes(tile.id)) {
      order.push(tile.id);
    }
  }
  const placed: Draft['placed'] = {};
  for (const [id, spot] of Object.entries(draft.placed)) {
    if (ids.has(id) && !occupied(spot.row, spot.col)) {
      placed[id] = spot;
    }
  }
  return { order, placed };
}

export function draftTileAt(draft: Draft, row: number, col: number): string | null {
  for (const [id, spot] of Object.entries(draft.placed)) {
    if (spot.row === row && spot.col === col) {
      return id;
    }
  }
  return null;
}

/** Tiles still on the rack, in display order. */
export function rackView(draft: Draft, rack: ReadonlyArray<Tile>): Tile[] {
  const byId = new Map(rack.map((tile) => [tile.id, tile]));
  return draft.order.filter((id) => !(id in draft.placed) && byId.has(id)).map((id) => byId.get(id)!);
}

/** Sets a tile on a square. Returns null when the square is taken. */
export function placeTile(draft: Draft, tileId: string, row: number, col: number, occupied: Occupied): Draft | null {
  if (!draft.order.includes(tileId) || occupied(row, col)) {
    return null;
  }
  const holder = draftTileAt(draft, row, col);
  if (holder && holder !== tileId) {
    return null;
  }
  const previous = draft.placed[tileId];
  const letter = previous && previous.row === row && previous.col === col ? previous.letter : null;
  return { ...draft, placed: { ...draft.placed, [tileId]: { row, col, letter } } };
}

/** Lifts a tile off the board. A blank forgets its letter. */
export function pickUp(draft: Draft, tileId: string): Draft {
  if (!(tileId in draft.placed)) {
    return draft;
  }
  const { [tileId]: _lifted, ...placed } = draft.placed;
  return { ...draft, placed };
}

export function setBlankLetter(draft: Draft, tileId: string, letter: string): Draft {
  const spot = draft.placed[tileId];
  if (!spot || !/^[A-Z]$/.test(letter)) {
    return draft;
  }
  return { ...draft, placed: { ...draft.placed, [tileId]: { ...spot, letter } } };
}

/** Moves a rack tile to a display slot among the tiles still on the rack. */
export function moveInRack(draft: Draft, tileId: string, toIndex: number): Draft {
  const visible = draft.order.filter((id) => !(id in draft.placed) && id !== tileId);
  if (!draft.order.includes(tileId)) {
    return draft;
  }
  const at = Math.max(0, Math.min(toIndex, visible.length));
  visible.splice(at, 0, tileId);
  const placedIds = draft.order.filter((id) => id in draft.placed && id !== tileId);
  return { ...draft, order: [...visible, ...placedIds] };
}

export function recallAll(draft: Draft): Draft {
  return { ...draft, placed: {} };
}

export function shuffleRack(draft: Draft, random: Pick<Random, 'int'>): Draft {
  const visible = draft.order.filter((id) => !(id in draft.placed));
  for (let i = visible.length - 1; i > 0; i--) {
    const j = random.int(i + 1);
    [visible[i], visible[j]] = [visible[j]!, visible[i]!];
  }
  return { ...draft, order: [...visible, ...draft.order.filter((id) => id in draft.placed)] };
}

export type DraftPlacements = { ok: true; placements: Placement[] } | { ok: false; blankTileId: string };

/** What Play sends. A blank without a chosen letter blocks the play so the picker can open. */
export function draftPlacements(draft: Draft, rack: ReadonlyArray<Tile>): DraftPlacements {
  const byId = new Map(rack.map((tile) => [tile.id, tile]));
  const placements: Placement[] = [];
  for (const id of draft.order) {
    const spot = draft.placed[id];
    const tile = byId.get(id);
    if (!spot || !tile) {
      continue;
    }
    if (tile.letter === null) {
      if (!spot.letter) {
        return { ok: false, blankTileId: id };
      }
      placements.push({ tileId: id, row: spot.row, col: spot.col, letter: spot.letter });
    } else {
      placements.push({ tileId: id, row: spot.row, col: spot.col });
    }
  }
  return { ok: true, placements };
}

export function placedCount(draft: Draft): number {
  return Object.keys(draft.placed).length;
}
