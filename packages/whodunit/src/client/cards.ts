import { ROOM_IDS, ROOM_NAME, SUSPECT_IDS, SUSPECT_NAME, WEAPON_IDS, WEAPON_NAME } from '../rules/constants.js';
import type { CardId, CardKind, RoomId, Solution, SuspectId, WeaponId } from '../rules/types.js';

const SUSPECTS = new Set<string>(SUSPECT_IDS);
const WEAPONS = new Set<string>(WEAPON_IDS);
const ROOMS = new Set<string>(ROOM_IDS);

export const ALL_CARDS: readonly CardId[] = [...SUSPECT_IDS, ...WEAPON_IDS, ...ROOM_IDS];

export function isSuspect(value: string): value is SuspectId {
  return SUSPECTS.has(value);
}

export function isWeapon(value: string): value is WeaponId {
  return WEAPONS.has(value);
}

export function isRoom(value: string): value is RoomId {
  return ROOMS.has(value);
}

export function cardKind(card: CardId): CardKind {
  return isSuspect(card) ? 'suspect' : isWeapon(card) ? 'weapon' : 'room';
}

export function cardName(card: CardId): string {
  if (isSuspect(card)) {
    return SUSPECT_NAME[card];
  }
  return isWeapon(card) ? WEAPON_NAME[card] : ROOM_NAME[card as RoomId];
}

/** "Captain Rook with the Poison Vial in the Wine Cellar". */
export function solutionLine(solution: Solution): string {
  return `${SUSPECT_NAME[solution.suspect]} with the ${WEAPON_NAME[solution.weapon]} in the ${ROOM_NAME[solution.room]}`;
}

/** Hands sort suspects, then weapons, then rooms, each in the board's order. */
export function sortCards(cards: readonly CardId[]): CardId[] {
  return [...cards].sort((a, b) => ALL_CARDS.indexOf(a) - ALL_CARDS.indexOf(b));
}
