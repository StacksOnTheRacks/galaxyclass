import type { ShipClass, ShipId } from './types.js';

/** The ocean is BOARD_SIZE × BOARD_SIZE. Wire coordinates are 0-based `{ row, col }`. */
export const BOARD_SIZE = 10;

/** Row markers down the left edge: row 0 is `A`. */
export const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;

/** Column markers along the top edge: col 0 is `1`. */
export const COL_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;

/** A table seats exactly two captains. */
export const SEAT_IDS = ['1', '2'] as const;
export const MAX_PLAYERS = 2;

export const SHIP_IDS = ['carrier', 'battleship', 'cruiser', 'submarine', 'destroyer'] as const;

/** The classic fleet, largest first. Every fleet has exactly one of each. */
export const FLEET: readonly ShipClass[] = [
  { id: 'carrier', name: 'Carrier', length: 5 },
  { id: 'battleship', name: 'Battleship', length: 4 },
  { id: 'cruiser', name: 'Cruiser', length: 3 },
  { id: 'submarine', name: 'Submarine', length: 3 },
  { id: 'destroyer', name: 'Destroyer', length: 2 },
];

export const SHIP_LENGTH: Readonly<Record<ShipId, number>> = {
  carrier: 5,
  battleship: 4,
  cruiser: 3,
  submarine: 3,
  destroyer: 2,
};

export const SHIP_NAME: Readonly<Record<ShipId, string>> = {
  carrier: 'Carrier',
  battleship: 'Battleship',
  cruiser: 'Cruiser',
  submarine: 'Submarine',
  destroyer: 'Destroyer',
};

/** Hits needed to sink the whole fleet. */
export const FLEET_CELL_COUNT = 17;

/**
 * Shot timeline. The server stamps `animationMs` on every shot and holds the next turn until it
 * has played, so both captains see the shot land before anyone can fire again.
 */
export const SHOT_LOCK_IN_MS = 150;
export const SONAR_SWEEP_MS = 900;
export const SONAR_TRACK_MS = 700;
export const SHOT_RESOLVE_MS = 450;
export const SHOT_ANIMATION_MS = SHOT_LOCK_IN_MS + SONAR_SWEEP_MS + SONAR_TRACK_MS + SHOT_RESOLVE_MS;
/** Added to a shot's `animationMs` when it sinks a ship, for the sink banner. */
export const SINK_ANNOUNCE_MS = 1600;
/** "Battle stations" transition between the last fleet going ready and the first shot. */
export const BATTLE_START_MS = 1800;
/** The next turn opens this much before the animation ends, to absorb delivery jitter. */
export const TURN_LOCK_GRACE_MS = 300;

/** A captain away this long during placement or battle can be declared abandoned by the other. */
export const AWAY_ABANDON_AFTER_MS = 10 * 60 * 1000;

/** Tables a member may host at once. */
export const MAX_OWNED_TABLES = 20;
/** Newest first; older memberships stay stored but drop off the list. */
export const MAX_LISTED_TABLES = 50;
export const MAX_TABLE_NAME_LENGTH = 40;
/** Inbound frames larger than this are refused before parsing. */
export const MAX_MESSAGE_BYTES = 4096;
