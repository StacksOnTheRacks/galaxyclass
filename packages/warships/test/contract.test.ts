import { describe, expect, it } from 'vitest';
import { CLIENT_ACTIONS, ERROR_CODES } from '../src/protocol.js';
import {
  BOARD_SIZE,
  COL_LABELS,
  FLEET,
  FLEET_CELL_COUNT,
  ROW_LABELS,
  SEAT_IDS,
  SHIP_IDS,
  SHIP_LENGTH,
  SHIP_NAME,
  SHOT_ANIMATION_MS,
  SONAR_SWEEP_MS,
  SONAR_TRACK_MS,
  SHOT_LOCK_IN_MS,
  SHOT_RESOLVE_MS,
  TURN_LOCK_GRACE_MS,
} from '../src/rules/constants.js';
import { connPk, memberPk, tableGsiPk, tablePk } from '../src/runtime/keys.js';

describe('warships contract', () => {
  it('describes the classic 10×10 board and five-ship fleet', () => {
    expect(ROW_LABELS).toHaveLength(BOARD_SIZE);
    expect(COL_LABELS).toHaveLength(BOARD_SIZE);
    expect(FLEET.map((ship) => ship.id)).toEqual([...SHIP_IDS]);
    expect(FLEET.map((ship) => ship.length)).toEqual([5, 4, 3, 3, 2]);
    for (const ship of FLEET) {
      expect(SHIP_LENGTH[ship.id]).toBe(ship.length);
      expect(SHIP_NAME[ship.id]).toBe(ship.name);
    }
    expect(FLEET.reduce((sum, ship) => sum + ship.length, 0)).toBe(FLEET_CELL_COUNT);
    expect(SEAT_IDS).toEqual(['1', '2']);
  });

  it('times a shot as the sum of its phases, with room for the turn-lock grace', () => {
    expect(SHOT_ANIMATION_MS).toBe(SHOT_LOCK_IN_MS + SONAR_SWEEP_MS + SONAR_TRACK_MS + SHOT_RESOLVE_MS);
    expect(TURN_LOCK_GRACE_MS).toBeLessThan(SHOT_RESOLVE_MS);
  });

  it('namespaces every partition key away from Scribble’s items in the shared table', () => {
    for (const key of [tablePk('t'), tableGsiPk('t'), connPk('c'), memberPk('s')]) {
      expect(key.startsWith('WS#')).toBe(true);
      expect(key).not.toMatch(/^(TABLE|MEMBER|CONN)#/);
    }
  });

  it('lists each client action and error code once', () => {
    expect(new Set(CLIENT_ACTIONS).size).toBe(CLIENT_ACTIONS.length);
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});
