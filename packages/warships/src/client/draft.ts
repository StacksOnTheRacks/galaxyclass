import { BOARD_SIZE, COL_LABELS, FLEET, ROW_LABELS, SHIP_IDS, SHIP_NAME } from '../rules/constants.js';
import { inBounds, randomFleet, shipCells, validateFleet } from '../rules/fleet.js';
import type { Random } from '../rules/random.js';
import type { Coord, Fleet, Orientation, ShipId, ShipPlacement } from '../rules/types.js';

/**
 * The fleet being arranged before ready-up. Pure: the placement view feeds it pointer and key
 * input; the server only ever sees the finished fleet.
 */
export type Draft = Readonly<Record<ShipId, ShipPlacement | null>>;

export const EMPTY_DRAFT: Draft = Object.freeze({
  carrier: null,
  battleship: null,
  cruiser: null,
  submarine: null,
  destroyer: null,
});

export function draftFromFleet(fleet: Fleet | null | undefined): Draft {
  const draft: Record<ShipId, ShipPlacement | null> = { ...EMPTY_DRAFT };
  for (const placement of fleet ?? []) {
    if ((SHIP_IDS as readonly string[]).includes(placement.shipId)) {
      draft[placement.shipId] = { shipId: placement.shipId, row: placement.row, col: placement.col, orientation: placement.orientation };
    }
  }
  return draft;
}

export function placedShips(draft: Draft): ShipPlacement[] {
  return FLEET.map((ship) => draft[ship.id]).filter((p): p is ShipPlacement => p !== null);
}

export function placedCount(draft: Draft): number {
  return placedShips(draft).length;
}

/** The whole fleet in FLEET order, once every ship is placed legally. */
export function completeFleet(draft: Draft): Fleet | null {
  const ships = placedShips(draft);
  if (ships.length !== FLEET.length) {
    return null;
  }
  const result = validateFleet(ships);
  return result.ok ? result.fleet : null;
}

export type FitResult = { ok: true } | { ok: false; reason: 'out_of_bounds' | 'overlap' };

/** Would `placement` fit with the rest of the draft (ignoring the ship's own current spot)? */
export function fits(draft: Draft, placement: ShipPlacement): FitResult {
  const cells = shipCells(placement);
  if (!cells.every(inBounds)) {
    return { ok: false, reason: 'out_of_bounds' };
  }
  const taken = new Set<number>();
  for (const other of placedShips(draft)) {
    if (other.shipId === placement.shipId) {
      continue;
    }
    for (const cell of shipCells(other)) {
      taken.add(cell.row * BOARD_SIZE + cell.col);
    }
  }
  return cells.some((cell) => taken.has(cell.row * BOARD_SIZE + cell.col)) ? { ok: false, reason: 'overlap' } : { ok: true };
}

export function place(draft: Draft, placement: ShipPlacement): Draft {
  return { ...draft, [placement.shipId]: { ...placement } };
}

export function remove(draft: Draft, shipId: ShipId): Draft {
  return { ...draft, [shipId]: null };
}

export function flip(orientation: Orientation): Orientation {
  return orientation === 'horizontal' ? 'vertical' : 'horizontal';
}

/** Rotation pivots on the bow, so the ship's first cell never moves. */
export function rotated(placement: ShipPlacement): ShipPlacement {
  return { ...placement, orientation: flip(placement.orientation) };
}

export function moved(placement: ShipPlacement, dRow: number, dCol: number): ShipPlacement {
  return { ...placement, row: placement.row + dRow, col: placement.col + dCol };
}

/** Keeps a carried ship on the board while the arrow keys move it. */
export function clampToBoard(placement: ShipPlacement): ShipPlacement {
  const cells = shipCells({ ...placement, row: 0, col: 0 });
  const last = cells[cells.length - 1]!;
  return {
    ...placement,
    row: Math.min(Math.max(placement.row, 0), BOARD_SIZE - 1 - last.row),
    col: Math.min(Math.max(placement.col, 0), BOARD_SIZE - 1 - last.col),
  };
}

/**
 * Pointer → bow cell. `x`/`y` are the pointer position relative to the top-left of cell A1, in
 * px; `grab` is where on the hull the pointer took hold, in cells from the bow.
 */
export function snapBow(x: number, y: number, cellSize: number, grab: { row: number; col: number }): Coord {
  return {
    row: Math.floor(y / cellSize - grab.row),
    col: Math.floor(x / cellSize - grab.col),
  };
}

/** Which hull segment (in cells from the bow) sits under a point on the ship. */
export function grabOffset(placement: Pick<ShipPlacement, 'orientation' | 'shipId'>, along: number): { row: number; col: number } {
  const length = shipCells({ ...placement, row: 0, col: 0 }).length;
  const clamped = Math.min(Math.max(along, 0), length - 0.001);
  return placement.orientation === 'horizontal' ? { row: 0.5, col: clamped } : { row: clamped, col: 0.5 };
}

export function randomDraft(random: Random): Draft {
  return draftFromFleet(randomFleet(random));
}

export function cellName(coord: Coord): string {
  return `${ROW_LABELS[coord.row] ?? '?'}${COL_LABELS[coord.col] ?? '?'}`;
}

/** "Cruiser at C3 to C5, horizontal." */
export function describePlacement(placement: ShipPlacement): string {
  const cells = shipCells(placement);
  return `${SHIP_NAME[placement.shipId]} at ${cellName(cells[0]!)} to ${cellName(cells[cells.length - 1]!)}, ${placement.orientation}.`;
}

/** The ship covering `coord` in the draft, if any. */
export function draftShipAt(draft: Draft, coord: Coord): ShipId | null {
  for (const placement of placedShips(draft)) {
    if (shipCells(placement).some((cell) => cell.row === coord.row && cell.col === coord.col)) {
      return placement.shipId;
    }
  }
  return null;
}

const FLEET_KEY_PREFIX = 'warships.fleet.';

/** The last fleet this captain readied at this table, for "Reuse last fleet" on a rematch. */
export function loadLastFleet(storage: Pick<Storage, 'getItem'> | null, tableId: string): Fleet | null {
  try {
    const raw = storage?.getItem(`${FLEET_KEY_PREFIX}${tableId}`);
    if (!raw) {
      return null;
    }
    const result = validateFleet(JSON.parse(raw));
    return result.ok ? result.fleet : null;
  } catch {
    return null;
  }
}

export function saveLastFleet(storage: Pick<Storage, 'setItem'> | null, tableId: string, fleet: Fleet): void {
  try {
    storage?.setItem(`${FLEET_KEY_PREFIX}${tableId}`, JSON.stringify(fleet));
  } catch {
    // Storage is off (private mode); Reuse just will not be offered.
  }
}
