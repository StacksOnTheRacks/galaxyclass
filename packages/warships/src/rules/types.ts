import type { SEAT_IDS, SHIP_IDS } from './constants.js';

export type SeatId = (typeof SEAT_IDS)[number];
export type ShipId = (typeof SHIP_IDS)[number];

/** 0-based. `row` maps to a letter A–J, `col` to a number 1–10: `{ row: 2, col: 6 }` is C7. */
export interface Coord {
  row: number;
  col: number;
}

export type Orientation = 'horizontal' | 'vertical';

export interface ShipClass {
  id: ShipId;
  name: string;
  length: number;
}

/** The bow sits at `(row, col)`; the hull runs toward higher `col` (horizontal) or higher `row` (vertical). */
export interface ShipPlacement {
  shipId: ShipId;
  row: number;
  col: number;
  orientation: Orientation;
}

/** Exactly one placement per ship in FLEET. Ships may touch; they may not overlap or leave the board. */
export type Fleet = ShipPlacement[];

export type FleetError = 'wrong_ships' | 'invalid_shape' | 'out_of_bounds' | 'overlap';

export type FleetValidation = { ok: true; fleet: Fleet } | { ok: false; reason: FleetError };

export type ShotResult = 'hit' | 'miss';

/** One shot as drawn on a board. Never names the ship it hit: that is revealed only by a sink. */
export interface ShotMark {
  row: number;
  col: number;
  result: ShotResult;
  turnNumber: number;
}

/** A ship whose every cell has been hit. Its placement is public from then on. */
export interface SunkShip extends ShipPlacement {
  length: number;
  sunkOnTurn: number;
}

/**
 * One resolved shot. Everything here is public to both captains: the shooter learns the result,
 * the defender watches it land. Kept in the game history and broadcast as the `shot` event.
 */
export interface ShotRecord {
  /** `${gameNumber}-${turnNumber}`; unique per table, so clients can de-duplicate replays. */
  shotId: string;
  gameNumber: number;
  turnNumber: number;
  shooter: SeatId;
  target: SeatId;
  coord: Coord;
  result: ShotResult;
  /** Present only when this shot sank a ship. */
  sunkShip?: SunkShip;
  /** True when this shot sank the last ship. */
  gameOver: boolean;
  /** Server epoch ms the shot resolved. */
  serverTs: number;
  /** How long the shot animation runs; the next turn opens at `serverTs + animationMs - TURN_LOCK_GRACE_MS`. */
  animationMs: number;
}

/** waiting → placing → battle → finished; a rematch goes finished → placing. */
export type GameStatus = 'waiting' | 'placing' | 'battle' | 'finished';

export type EndReason = 'fleet_sunk' | 'forfeit' | 'abandoned';
