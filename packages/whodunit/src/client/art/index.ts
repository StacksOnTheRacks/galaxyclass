import type { RoomId, SuspectId, WeaponId } from '../../rules/types.js';
import { caseFile } from './case-file.js';
import { PORTRAITS } from './portraits.js';
import { ROOM_ART } from './rooms.js';
import { WEAPON_ICONS } from './weapons.js';

/**
 * Hand-drawn SVG for the mansion, the suspects, and the weapons. Every function returns static
 * inner markup (no outer <svg>) built from constants only, so it is safe to set as innerHTML.
 */

/** A suspect's portrait, drawn in a 0 0 100 100 box. */
export function portraitMarkup(id: SuspectId): string {
  return PORTRAITS[id];
}

/** A weapon token's icon, drawn in a 0 0 64 64 box. */
export function weaponMarkup(id: WeaponId): string {
  return WEAPON_ICONS[id];
}

/** A room's floor and furnishings, top-down, drawn in a 0 0 w*10 h*10 box (10 units per square). */
export function roomMarkup(id: RoomId, w: number, h: number): string {
  return ROOM_ART[id](w * 10, h * 10);
}

/** The sealed case file and staircase in the middle of the board, drawn in a 0 0 w*10 h*10 box. */
export function caseFileMarkup(w: number, h: number): string {
  return caseFile(w * 10, h * 10);
}
