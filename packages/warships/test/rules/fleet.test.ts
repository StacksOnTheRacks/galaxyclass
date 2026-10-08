import { describe, expect, it } from 'vitest';
import { FLEET, FLEET_CELL_COUNT, SHIP_IDS } from '../../src/rules/constants.js';
import { inBounds, randomFleet, shipAt, shipCells, shipsAfloat, sunkShips, validateFleet } from '../../src/rules/fleet.js';
import { seededRandom } from '../../src/rules/random.js';
import type { ShotMark } from '../../src/rules/types.js';
import { A_FLEET, B_FLEET, cellsOf } from '../support/fleets.js';

const hit = (row: number, col: number, turnNumber = 1): ShotMark => ({ row, col, result: 'hit', turnNumber });

describe('shipCells', () => {
  it('runs the hull from the bow toward higher columns or rows', () => {
    expect(shipCells({ shipId: 'cruiser', row: 2, col: 6, orientation: 'horizontal' })).toEqual([
      { row: 2, col: 6 },
      { row: 2, col: 7 },
      { row: 2, col: 8 },
    ]);
    expect(shipCells({ shipId: 'destroyer', row: 8, col: 0, orientation: 'vertical' })).toEqual([
      { row: 8, col: 0 },
      { row: 9, col: 0 },
    ]);
    expect(shipCells({ shipId: 'carrier', row: 0, col: 0, orientation: 'vertical' })).toHaveLength(5);
  });

  it('knows the board edges', () => {
    expect(inBounds({ row: 0, col: 0 })).toBe(true);
    expect(inBounds({ row: 9, col: 9 })).toBe(true);
    expect(inBounds({ row: 10, col: 0 })).toBe(false);
    expect(inBounds({ row: 0, col: -1 })).toBe(false);
    expect(inBounds({ row: 1.5, col: 0 })).toBe(false);
  });
});

describe('validateFleet', () => {
  it('accepts a legal fleet and normalizes it to FLEET order with only the four keys', () => {
    const shuffled = [...A_FLEET].reverse();
    const result = validateFleet(shuffled);
    expect(result).toEqual({ ok: true, fleet: A_FLEET });
    if (result.ok) {
      expect(result.fleet.map((ship) => ship.shipId)).toEqual([...SHIP_IDS]);
    }
  });

  it('allows ships to touch', () => {
    const touching = [
      { shipId: 'carrier', row: 0, col: 0, orientation: 'horizontal' },
      { shipId: 'battleship', row: 1, col: 0, orientation: 'horizontal' },
      { shipId: 'cruiser', row: 2, col: 0, orientation: 'horizontal' },
      { shipId: 'submarine', row: 3, col: 0, orientation: 'horizontal' },
      { shipId: 'destroyer', row: 0, col: 5, orientation: 'vertical' },
    ];
    expect(validateFleet(touching).ok).toBe(true);
  });

  it('refuses a missing, duplicate, extra, or unknown ship', () => {
    expect(validateFleet(A_FLEET.slice(0, 4))).toEqual({ ok: false, reason: 'wrong_ships' });
    expect(validateFleet([...A_FLEET.slice(0, 4), { ...A_FLEET[3]!, row: 9 }])).toEqual({ ok: false, reason: 'wrong_ships' });
    expect(validateFleet([...A_FLEET, { shipId: 'destroyer', row: 9, col: 5, orientation: 'horizontal' }])).toEqual({
      ok: false,
      reason: 'wrong_ships',
    });
    expect(validateFleet([...A_FLEET.slice(0, 4), { ...A_FLEET[4]!, shipId: 'dinghy' }])).toEqual({
      ok: false,
      reason: 'wrong_ships',
    });
  });

  it('refuses anything that is not a list of plain placements', () => {
    for (const value of [null, undefined, 'fleet', 42, {}, [1, 2, 3, 4, 5]]) {
      expect(validateFleet(value)).toEqual({ ok: false, reason: 'invalid_shape' });
    }
    const bent = (patch: Record<string, unknown>) => [{ ...A_FLEET[0]!, ...patch }, ...A_FLEET.slice(1)];
    expect(validateFleet(bent({ row: 1.5 }))).toEqual({ ok: false, reason: 'invalid_shape' });
    expect(validateFleet(bent({ col: '3' }))).toEqual({ ok: false, reason: 'invalid_shape' });
    expect(validateFleet(bent({ orientation: 'diagonal' }))).toEqual({ ok: false, reason: 'invalid_shape' });
  });

  it('refuses unknown or missing keys, so a fleet cannot smuggle state', () => {
    const extra = [{ ...A_FLEET[0]!, hits: [] }, ...A_FLEET.slice(1)];
    expect(validateFleet(extra)).toEqual({ ok: false, reason: 'invalid_shape' });
    const { orientation: _o, ...missing } = A_FLEET[0]!;
    expect(validateFleet([missing, ...A_FLEET.slice(1)])).toEqual({ ok: false, reason: 'invalid_shape' });
  });

  it('refuses a ship off the board', () => {
    const off = [{ shipId: 'carrier', row: 0, col: 6, orientation: 'horizontal' }, ...A_FLEET.slice(1)];
    expect(validateFleet(off)).toEqual({ ok: false, reason: 'out_of_bounds' });
    const below = [{ shipId: 'carrier', row: 6, col: 9, orientation: 'vertical' }, ...A_FLEET.slice(1)];
    expect(validateFleet(below)).toEqual({ ok: false, reason: 'out_of_bounds' });
    const negative = [{ shipId: 'carrier', row: -1, col: 0, orientation: 'horizontal' }, ...A_FLEET.slice(1)];
    expect(validateFleet(negative)).toEqual({ ok: false, reason: 'out_of_bounds' });
  });

  it('refuses overlapping ships', () => {
    const crossing = [{ shipId: 'carrier', row: 0, col: 1, orientation: 'vertical' }, ...A_FLEET.slice(1)];
    expect(validateFleet(crossing)).toEqual({ ok: false, reason: 'overlap' });
  });
});

describe('randomFleet', () => {
  it('always places a legal fleet', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const fleet = randomFleet(seededRandom(seed));
      const result = validateFleet(fleet);
      expect(result.ok).toBe(true);
      expect(cellsOf(fleet)).toHaveLength(FLEET_CELL_COUNT);
    }
  });

  it('varies with the seed and repeats for the same one', () => {
    expect(randomFleet(seededRandom(7))).toEqual(randomFleet(seededRandom(7)));
    expect(randomFleet(seededRandom(7))).not.toEqual(randomFleet(seededRandom(8)));
  });
});

describe('ship lookups', () => {
  it('finds the ship under a cell', () => {
    expect(shipAt(A_FLEET, { row: 0, col: 4 })).toBe('carrier');
    expect(shipAt(A_FLEET, { row: 8, col: 1 })).toBe('destroyer');
    expect(shipAt(A_FLEET, { row: 1, col: 0 })).toBeNull();
  });

  it('counts a ship sunk only once every cell is hit, on the turn of its last hit', () => {
    const destroyer = cellsOf(B_FLEET, 'destroyer');
    expect(sunkShips(B_FLEET, [hit(destroyer[0]!.row, destroyer[0]!.col, 3)])).toEqual([]);
    const marks = [hit(destroyer[0]!.row, destroyer[0]!.col, 3), hit(destroyer[1]!.row, destroyer[1]!.col, 7)];
    expect(sunkShips(B_FLEET, marks)).toEqual([
      { shipId: 'destroyer', row: 8, col: 1, orientation: 'vertical', length: 2, sunkOnTurn: 7 },
    ]);
    expect(shipsAfloat(B_FLEET, marks)).toBe(FLEET.length - 1);
  });

  it('ignores misses on ship cells and counts every ship sunk by a full broadside', () => {
    const misses = cellsOf(A_FLEET).map(({ row, col }): ShotMark => ({ row, col, result: 'miss', turnNumber: 1 }));
    expect(sunkShips(A_FLEET, misses)).toEqual([]);
    const all = cellsOf(A_FLEET).map(({ row, col }, i) => hit(row, col, i + 1));
    expect(shipsAfloat(A_FLEET, all)).toBe(0);
  });
});
