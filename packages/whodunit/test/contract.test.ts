import { describe, expect, expectTypeOf, it } from 'vitest';
import { CLIENT_ACTIONS, CLIENT_SUPPLIED_STATE_KEYS, ERROR_CODES, type ClientActionName } from '../src/protocol.js';
import { CASE_FILE, ROOM_LAYOUT, START_CELLS } from '../src/rules/board.js';
import { ALL_CARDS } from '../src/rules/cards.js';
import {
  CARD_COUNT,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MOVE_LEAD_MS,
  MOVE_SETTLE_MS,
  ROLL_MS,
  ROOMS,
  ROOM_IDS,
  SEAT_IDS,
  SUSPECTS,
  SUSPECT_IDS,
  TURN_LOCK_GRACE_MS,
  WEAPONS,
  WEAPON_IDS,
} from '../src/rules/constants.js';
import { connPk, KEY_PREFIX, memberPk, tableGsiPk, tablePk } from '../src/runtime/keys.js';

describe('whodunit contract', () => {
  it('has six suspects, six weapons, and nine rooms, each card id used once', () => {
    expect(SUSPECT_IDS).toHaveLength(6);
    expect(WEAPON_IDS).toHaveLength(6);
    expect(ROOM_IDS).toHaveLength(9);
    expect(ALL_CARDS).toHaveLength(CARD_COUNT);
    expect(CARD_COUNT).toBe(21);
    expect(new Set(ALL_CARDS).size).toBe(ALL_CARDS.length);
    expect(SUSPECTS.map((s) => s.id)).toEqual([...SUSPECT_IDS]);
    expect(WEAPONS.map((w) => w.id)).toEqual([...WEAPON_IDS]);
    expect(ROOMS.map((r) => r.id)).toEqual([...ROOM_IDS]);
  });

  it('seats three to six detectives, one starting square per suspect', () => {
    expect(SEAT_IDS).toEqual(['1', '2', '3', '4', '5', '6']);
    expect([MIN_PLAYERS, MAX_PLAYERS]).toEqual([3, 6]);
    expect(Object.keys(START_CELLS).sort()).toEqual([...SUSPECT_IDS].sort());
    expect(Object.keys(ROOM_LAYOUT).sort()).toEqual([...ROOM_IDS].sort());
    expect(CASE_FILE).toBeDefined();
  });

  it('leaves the turn lock shorter than any animation it trims', () => {
    expect(TURN_LOCK_GRACE_MS).toBeLessThan(ROLL_MS);
    expect(TURN_LOCK_GRACE_MS).toBeLessThan(MOVE_LEAD_MS + MOVE_SETTLE_MS);
  });

  it('namespaces every partition key away from Scribble’s and Warships’ items in the shared table', () => {
    expect(KEY_PREFIX).toBe('WD#');
    for (const key of [tablePk('t'), tableGsiPk('t'), connPk('c'), memberPk('s')]) {
      expect(key.startsWith('WD#')).toBe(true);
      expect(key).not.toMatch(/^(TABLE|MEMBER|CONN|WS)#/);
    }
  });

  it('lists each client action, error code, and server-owned key once, covering every action', () => {
    expect(new Set(CLIENT_ACTIONS).size).toBe(CLIENT_ACTIONS.length);
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    expect(new Set(CLIENT_SUPPLIED_STATE_KEYS).size).toBe(CLIENT_SUPPLIED_STATE_KEYS.length);
    expectTypeOf<ClientActionName>().toEqualTypeOf<(typeof CLIENT_ACTIONS)[number]>();
    for (const key of CLIENT_SUPPLIED_STATE_KEYS) {
      expect(['action', 'seatToken', 'accessToken', 'suspect', 'weapon', 'room', 'card', 'to', 'seatId']).not.toContain(key);
    }
  });
});
