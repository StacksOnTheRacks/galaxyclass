import type { ROOM_IDS, SEAT_IDS, SUSPECT_IDS, WEAPON_IDS } from './constants.js';

export type SeatId = (typeof SEAT_IDS)[number];
export type SuspectId = (typeof SUSPECT_IDS)[number];
export type WeaponId = (typeof WEAPON_IDS)[number];
export type RoomId = (typeof ROOM_IDS)[number];

/** Suspect, weapon, and room ids never collide, so a card is just its id. */
export type CardId = SuspectId | WeaponId | RoomId;
export type CardKind = 'suspect' | 'weapon' | 'room';

/** A hallway square: `x` is the column (0 = west edge), `y` the row (0 = north edge). */
export interface Cell {
  x: number;
  y: number;
}

/** Where a suspect token stands: on a hallway square, or somewhere inside a room. */
export type TokenPosition = { kind: 'hall'; x: number; y: number } | { kind: 'room'; room: RoomId };

/** What a `move` asks for. The server finds the path. */
export type Destination = TokenPosition;

/** The three cards in the case file. */
export interface Solution {
  suspect: SuspectId;
  weapon: WeaponId;
  room: RoomId;
}

/** A suggestion is always made in the room the suggester stands in. */
export type Suggestion = Solution;

/** setup → playing → finished; a new case goes finished → setup. */
export type GameStatus = 'setup' | 'playing' | 'finished';

/**
 * Within one detective's turn:
 * - `start`: roll, take a secret passage, suggest (only if a suggestion pulled you into this room), accuse, or pass.
 * - `moving`: dice are rolled; pick a destination (or pass).
 * - `moved`: suggest if you entered a room this turn, accuse, or end the turn.
 * - `refuting`: waiting for `refuterSeatId` to show the suggester a card.
 * - `suggested`: the suggestion is settled; accuse or end the turn.
 */
export type TurnPhase = 'start' | 'moving' | 'moved' | 'refuting' | 'suggested';

/** `solved`: a correct accusation. `unsolved`: every detective accused wrongly. `abandoned`: fewer than two remained. */
export type EndReason = 'solved' | 'unsolved' | 'abandoned';

export type DepartReason = 'left' | 'abandoned';

export type MoveVia = 'walk' | 'passage';
