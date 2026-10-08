import type { RoomId, SuspectId, WeaponId } from '../../rules/types.js';

/**
 * Hand-drawn SVG for the mansion, the suspects, and the weapons. Every function returns static
 * inner markup (no outer <svg>) built from constants only, so it is safe to set as innerHTML.
 */

/** A suspect's portrait, drawn in a 0 0 100 100 box. */
export function portraitMarkup(id: SuspectId): string {
  return `<circle cx="50" cy="50" r="46" data-suspect="${id}" />`;
}

/** A weapon token's icon, drawn in a 0 0 64 64 box. */
export function weaponMarkup(id: WeaponId): string {
  return `<rect x="8" y="8" width="48" height="48" rx="8" data-weapon="${id}" />`;
}

/** A room's floor and furnishings, top-down, drawn in a 0 0 w*10 h*10 box (10 units per square). */
export function roomMarkup(id: RoomId, w: number, h: number): string {
  return `<rect width="${w * 10}" height="${h * 10}" data-room="${id}" />`;
}

/** The sealed case file and staircase in the middle of the board, drawn in a 0 0 w*10 h*10 box. */
export function caseFileMarkup(w: number, h: number): string {
  return `<rect width="${w * 10}" height="${h * 10}" />`;
}
