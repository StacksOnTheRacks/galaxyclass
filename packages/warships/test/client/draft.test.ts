import { describe, expect, it } from 'vitest';
import {
  clampToBoard,
  completeFleet,
  describePlacement,
  draftFromFleet,
  draftShipAt,
  EMPTY_DRAFT,
  fits,
  grabOffset,
  loadLastFleet,
  place,
  placedCount,
  randomDraft,
  remove,
  rotated,
  saveLastFleet,
  snapBow,
} from '../../src/client/draft.js';
import { validateFleet } from '../../src/rules/fleet.js';
import { seededRandom } from '../../src/rules/random.js';
import { FLEET_A } from './support.js';

describe('fleet draft', () => {
  it('only completes once all five ships sit legally', () => {
    let draft = EMPTY_DRAFT;
    for (const ship of FLEET_A.slice(0, 4)) {
      draft = place(draft, ship);
    }
    expect(placedCount(draft)).toBe(4);
    expect(completeFleet(draft)).toBeNull();
    draft = place(draft, FLEET_A[4]!);
    expect(completeFleet(draft)).toEqual(FLEET_A);
    expect(completeFleet(remove(draft, 'cruiser'))).toBeNull();
  });

  it('rejects a drop that leaves the board or overlaps, ignoring the ship’s own spot', () => {
    const draft = draftFromFleet(FLEET_A);
    expect(fits(draft, { shipId: 'carrier', row: 0, col: 6, orientation: 'horizontal' })).toEqual({ ok: false, reason: 'out_of_bounds' });
    expect(fits(draft, { shipId: 'destroyer', row: 3, col: 0, orientation: 'vertical' })).toEqual({ ok: false, reason: 'overlap' });
    expect(fits(draft, { shipId: 'carrier', row: 0, col: 1, orientation: 'horizontal' })).toEqual({ ok: true });
    expect(fits(draft, { shipId: 'destroyer', row: 8, col: 9, orientation: 'vertical' })).toEqual({ ok: true });
  });

  it('rotates about the bow, so the first cell stays put', () => {
    const cruiser = { shipId: 'cruiser' as const, row: 2, col: 2, orientation: 'horizontal' as const };
    expect(rotated(cruiser)).toEqual({ ...cruiser, orientation: 'vertical' });
    expect(describePlacement(cruiser)).toBe('Cruiser at C3 to C5, horizontal.');
    expect(describePlacement(rotated(cruiser))).toBe('Cruiser at C3 to E3, vertical.');
  });

  it('a rotation that would leave the board does not fit, so the view reverts it', () => {
    const draft = draftFromFleet(FLEET_A);
    const carrier = { shipId: 'carrier' as const, row: 7, col: 0, orientation: 'horizontal' as const };
    expect(fits(remove(draft, 'carrier'), carrier)).toEqual({ ok: true });
    expect(fits(remove(draft, 'carrier'), rotated(carrier))).toEqual({ ok: false, reason: 'out_of_bounds' });
  });

  it('snaps the bow to the cell under the grabbed hull segment', () => {
    // 40 px cells; pointer at (130, 95) holding the third segment of a horizontal ship.
    const grab = grabOffset({ shipId: 'cruiser', orientation: 'horizontal' }, 2.3);
    expect(grab).toEqual({ row: 0.5, col: 2.3 });
    expect(snapBow(130, 95, 40, grab)).toEqual({ row: 1, col: 0 });
    expect(grabOffset({ shipId: 'destroyer', orientation: 'vertical' }, 9)).toEqual({ row: 1.999, col: 0.5 });
  });

  it('keeps a keyboard-carried ship on the board', () => {
    expect(clampToBoard({ shipId: 'carrier', row: -1, col: 8, orientation: 'horizontal' })).toEqual({
      shipId: 'carrier',
      row: 0,
      col: 5,
      orientation: 'horizontal',
    });
    expect(clampToBoard({ shipId: 'battleship', row: 9, col: 9, orientation: 'vertical' })).toMatchObject({ row: 6, col: 9 });
  });

  it('randomizes into a valid fleet every time', () => {
    const random = seededRandom(42);
    for (let i = 0; i < 25; i++) {
      const fleet = completeFleet(randomDraft(random));
      expect(fleet).not.toBeNull();
      expect(validateFleet(fleet).ok).toBe(true);
    }
  });

  it('finds the ship under a cell', () => {
    const draft = draftFromFleet(FLEET_A);
    expect(draftShipAt(draft, { row: 2, col: 1 })).toBe('cruiser');
    expect(draftShipAt(draft, { row: 2, col: 3 })).toBeNull();
  });

  it('remembers the last readied fleet per table, and ignores anything invalid', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    saveLastFleet(storage, 't1', FLEET_A);
    expect([...store.keys()]).toEqual(['warships.fleet.t1']);
    expect(loadLastFleet(storage, 't1')).toEqual(FLEET_A);
    expect(loadLastFleet(storage, 't2')).toBeNull();
    store.set('warships.fleet.t3', '[{"shipId":"carrier","row":0,"col":0,"orientation":"horizontal"}]');
    store.set('warships.fleet.t4', '{not json');
    expect(loadLastFleet(storage, 't3')).toBeNull();
    expect(loadLastFleet(storage, 't4')).toBeNull();
    expect(loadLastFleet(null, 't1')).toBeNull();
  });
});
