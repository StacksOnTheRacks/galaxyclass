import { ROOM_IDS, ROOM_NAME, SEAT_IDS, SUSPECT_IDS, SUSPECT_NAME, WEAPON_IDS, WEAPON_NAME } from './constants.js';
import type { CardId, CardKind, RoomId, SeatId, Solution, SuspectId, WeaponId } from './types.js';

/** Every card in the game: suspects, then weapons, then rooms. */
export const ALL_CARDS: readonly CardId[] = [...SUSPECT_IDS, ...WEAPON_IDS, ...ROOM_IDS];

export function isSeatId(value: unknown): value is SeatId {
  return typeof value === 'string' && (SEAT_IDS as readonly string[]).includes(value);
}

export function isSuspectId(value: unknown): value is SuspectId {
  return typeof value === 'string' && (SUSPECT_IDS as readonly string[]).includes(value);
}

export function isWeaponId(value: unknown): value is WeaponId {
  return typeof value === 'string' && (WEAPON_IDS as readonly string[]).includes(value);
}

export function isRoomId(value: unknown): value is RoomId {
  return typeof value === 'string' && (ROOM_IDS as readonly string[]).includes(value);
}

export function isCardId(value: unknown): value is CardId {
  return isSuspectId(value) || isWeaponId(value) || isRoomId(value);
}

export function cardKind(card: CardId): CardKind {
  return isSuspectId(card) ? 'suspect' : isWeaponId(card) ? 'weapon' : 'room';
}

export function cardName(card: CardId): string {
  return isSuspectId(card) ? SUSPECT_NAME[card] : isWeaponId(card) ? WEAPON_NAME[card] : ROOM_NAME[card];
}

/** The three cards a suggestion or accusation names. */
export function namedCards(named: Solution): CardId[] {
  return [named.suspect, named.weapon, named.room];
}

/** The cards in `hand` that disprove `named`, in hand order. */
export function matchingCards(hand: readonly CardId[], named: Solution): CardId[] {
  const wanted = new Set(namedCards(named));
  return hand.filter((card) => wanted.has(card));
}

export function sameSolution(a: Solution, b: Solution): boolean {
  return a.suspect === b.suspect && a.weapon === b.weapon && a.room === b.room;
}
