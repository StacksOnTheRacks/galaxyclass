import { BOARD_SIZE, FLEET, SHIP_IDS, SHIP_LENGTH } from './constants.js';
import type { Random } from './random.js';
import type {
  Coord,
  Fleet,
  FleetValidation,
  Orientation,
  ShipId,
  ShipPlacement,
  ShotMark,
  SunkShip,
} from './types.js';

/**
 * Fleet geometry. Pure and dependency-free so the client can use the same checks for its placement
 * preview and Randomize button that the runtime uses to accept a fleet.
 */

const PLACEMENT_KEYS = ['shipId', 'row', 'col', 'orientation'] as const;
const ORIENTATIONS: readonly Orientation[] = ['horizontal', 'vertical'];

function cellKey(coord: Coord): number {
  return coord.row * BOARD_SIZE + coord.col;
}

/** The cells a placement covers, bow first. */
export function shipCells(placement: ShipPlacement): Coord[] {
  const length = SHIP_LENGTH[placement.shipId];
  const cells: Coord[] = [];
  for (let i = 0; i < length; i++) {
    cells.push(
      placement.orientation === 'horizontal'
        ? { row: placement.row, col: placement.col + i }
        : { row: placement.row + i, col: placement.col },
    );
  }
  return cells;
}

export function inBounds(coord: Coord): boolean {
  return (
    Number.isInteger(coord.row) &&
    Number.isInteger(coord.col) &&
    coord.row >= 0 &&
    coord.row < BOARD_SIZE &&
    coord.col >= 0 &&
    coord.col < BOARD_SIZE
  );
}

function isShipId(value: unknown): value is ShipId {
  return typeof value === 'string' && (SHIP_IDS as readonly string[]).includes(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Shape-checks untrusted input and checks the rules: one of each ship in FLEET, integer in-bounds
 * cells, no overlaps. Ships may touch. Returns the fleet normalized to FLEET order.
 */
export function validateFleet(value: unknown): FleetValidation {
  if (!Array.isArray(value)) return { ok: false, reason: 'invalid_shape' };
  for (const item of value) {
    if (!isPlainObject(item)) return { ok: false, reason: 'invalid_shape' };
  }
  const items = value as Record<string, unknown>[];

  const ids = items.map((item) => item.shipId);
  if (
    items.length !== SHIP_IDS.length ||
    !ids.every(isShipId) ||
    new Set(ids).size !== SHIP_IDS.length
  ) {
    return { ok: false, reason: 'wrong_ships' };
  }

  const placements: ShipPlacement[] = [];
  for (const item of items) {
    const keys = Object.keys(item);
    if (keys.length !== PLACEMENT_KEYS.length || !keys.every((key) => (PLACEMENT_KEYS as readonly string[]).includes(key))) {
      return { ok: false, reason: 'invalid_shape' };
    }
    const { shipId, row, col, orientation } = item;
    if (
      !Number.isInteger(row) ||
      !Number.isInteger(col) ||
      typeof orientation !== 'string' ||
      !(ORIENTATIONS as readonly string[]).includes(orientation)
    ) {
      return { ok: false, reason: 'invalid_shape' };
    }
    placements.push({
      shipId: shipId as ShipId,
      row: row as number,
      col: col as number,
      orientation: orientation as Orientation,
    });
  }

  for (const placement of placements) {
    if (!shipCells(placement).every(inBounds)) return { ok: false, reason: 'out_of_bounds' };
  }

  const occupied = new Set<number>();
  for (const placement of placements) {
    for (const cell of shipCells(placement)) {
      const key = cellKey(cell);
      if (occupied.has(key)) return { ok: false, reason: 'overlap' };
      occupied.add(key);
    }
  }

  const byId = new Map(placements.map((placement) => [placement.shipId, placement]));
  return { ok: true, fleet: FLEET.map((ship) => byId.get(ship.id)!) };
}

/** A valid fleet placed uniformly at random. */
export function randomFleet(random: Random): Fleet {
  const occupied = new Set<number>();
  const fleet: Fleet = [];
  for (const ship of FLEET) {
    for (;;) {
      const orientation: Orientation = random.int(2) === 0 ? 'horizontal' : 'vertical';
      const span = BOARD_SIZE - ship.length + 1;
      const placement: ShipPlacement =
        orientation === 'horizontal'
          ? { shipId: ship.id, row: random.int(BOARD_SIZE), col: random.int(span), orientation }
          : { shipId: ship.id, row: random.int(span), col: random.int(BOARD_SIZE), orientation };
      const cells = shipCells(placement);
      if (cells.some((cell) => occupied.has(cellKey(cell)))) continue;
      for (const cell of cells) occupied.add(cellKey(cell));
      fleet.push(placement);
      break;
    }
  }
  return fleet;
}

/** The ship occupying `coord`, if any. */
export function shipAt(fleet: Fleet, coord: Coord): ShipId | null {
  for (const placement of fleet) {
    if (shipCells(placement).some((cell) => cell.row === coord.row && cell.col === coord.col)) {
      return placement.shipId;
    }
  }
  return null;
}

/** Ships of `fleet` every cell of which appears as a hit in `incoming`. */
export function sunkShips(fleet: Fleet, incoming: ReadonlyArray<ShotMark>): SunkShip[] {
  const hitTurn = new Map<number, number>();
  for (const mark of incoming) {
    if (mark.result !== 'hit') continue;
    const key = cellKey(mark);
    const prior = hitTurn.get(key);
    if (prior === undefined || mark.turnNumber < prior) hitTurn.set(key, mark.turnNumber);
  }
  const sunk: SunkShip[] = [];
  for (const placement of fleet) {
    const turns = shipCells(placement).map((cell) => hitTurn.get(cellKey(cell)));
    if (turns.every((turn) => turn !== undefined)) {
      sunk.push({
        shipId: placement.shipId,
        row: placement.row,
        col: placement.col,
        orientation: placement.orientation,
        length: SHIP_LENGTH[placement.shipId],
        sunkOnTurn: Math.max(...(turns as number[])),
      });
    }
  }
  return sunk;
}

export function shipsAfloat(fleet: Fleet, incoming: ReadonlyArray<ShotMark>): number {
  return fleet.length - sunkShips(fleet, incoming).length;
}
