import { BOARD_SIZE } from '../../src/rules/constants.js';
import { shipCells } from '../../src/rules/fleet.js';
import type { Coord, Fleet, ShipId } from '../../src/rules/types.js';

/** Five ships stacked horizontally down the left edge, a row apart: A1–A5, C1–C4, E1–E3, G1–G3, I1–I2. */
export const A_FLEET: Fleet = [
  { shipId: 'carrier', row: 0, col: 0, orientation: 'horizontal' },
  { shipId: 'battleship', row: 2, col: 0, orientation: 'horizontal' },
  { shipId: 'cruiser', row: 4, col: 0, orientation: 'horizontal' },
  { shipId: 'submarine', row: 6, col: 0, orientation: 'horizontal' },
  { shipId: 'destroyer', row: 8, col: 0, orientation: 'horizontal' },
];

/** Five ships standing vertically: carrier in column 10, battleship 8, cruiser 6, submarine 4 (F–H), destroyer 2 (I–J). */
export const B_FLEET: Fleet = [
  { shipId: 'carrier', row: 0, col: 9, orientation: 'vertical' },
  { shipId: 'battleship', row: 0, col: 7, orientation: 'vertical' },
  { shipId: 'cruiser', row: 0, col: 5, orientation: 'vertical' },
  { shipId: 'submarine', row: 5, col: 3, orientation: 'vertical' },
  { shipId: 'destroyer', row: 8, col: 1, orientation: 'vertical' },
];

export function cellsOf(fleet: Fleet, shipId?: ShipId): Coord[] {
  return fleet.filter((ship) => !shipId || ship.shipId === shipId).flatMap(shipCells);
}

/** Every cell of the board no ship in `fleet` covers, in reading order. */
export function waterOf(fleet: Fleet): Coord[] {
  const taken = new Set(cellsOf(fleet).map(({ row, col }) => row * BOARD_SIZE + col));
  const water: Coord[] = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (!taken.has(row * BOARD_SIZE + col)) water.push({ row, col });
    }
  }
  return water;
}
