import { BOARD_COLS, BOARD_ROWS, CASE_FILE, ROOM_LAYOUT, type Rect } from '../rules/board.js';
import { SUSPECT_IDS, WEAPON_IDS } from '../rules/constants.js';
import type { Cell, RoomId, SuspectId, TokenPosition, WeaponId } from '../rules/types.js';

/** SVG units per square; the art draws rooms at the same scale. */
export const UNIT = 10;
/** A thin frame around the mansion so edge tokens and walls are not clipped. */
export const BOARD_MARGIN = 6;
export const BOARD_WIDTH = BOARD_COLS * UNIT;
export const BOARD_HEIGHT = BOARD_ROWS * UNIT;
export const TOKEN_RADIUS = 4.4;
export const WEAPON_SIZE = 7.6;

export interface Point {
  x: number;
  y: number;
}

export function rectUnits(rect: Rect): { x: number; y: number; w: number; h: number } {
  return { x: rect.x * UNIT, y: rect.y * UNIT, w: rect.w * UNIT, h: rect.h * UNIT };
}

export function cellCenterUnits(cell: Cell): Point {
  return { x: (cell.x + 0.5) * UNIT, y: (cell.y + 0.5) * UNIT };
}

/**
 * Every suspect has its own spot in every room (a 3 × 2 grid across the lower half) and every
 * weapon its own spot along the upper half, so tokens never shuffle when someone else walks in.
 */
export function suspectSlot(room: RoomId, suspect: SuspectId): Point {
  const r = rectUnits(ROOM_LAYOUT[room].rect);
  const index = SUSPECT_IDS.indexOf(suspect);
  const col = index % 3;
  const row = Math.floor(index / 3);
  return { x: r.x + r.w * (0.25 + 0.25 * col), y: r.y + r.h * (0.6 + 0.21 * row) };
}

export function weaponSlot(room: RoomId, weapon: WeaponId): Point {
  const r = rectUnits(ROOM_LAYOUT[room].rect);
  const index = WEAPON_IDS.indexOf(weapon);
  return { x: r.x + (r.w * (index + 1)) / (WEAPON_IDS.length + 1), y: r.y + r.h * 0.37 };
}

export function roomCenter(room: RoomId): Point {
  const r = rectUnits(ROOM_LAYOUT[room].rect);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Where a suspect's token is drawn for a position. */
export function tokenPoint(position: TokenPosition, suspect: SuspectId): Point {
  return position.kind === 'hall' ? cellCenterUnits(position) : suspectSlot(position.room, suspect);
}

export function caseFileCenter(): Point {
  const r = rectUnits(CASE_FILE);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export type WallSide = 'north' | 'south' | 'east' | 'west';

/** The wall a door's hallway square faces, as a short segment on the room's edge (SVG units). */
export function doorSegment(room: RoomId, door: Cell): { side: WallSide; x1: number; y1: number; x2: number; y2: number } {
  const { rect } = ROOM_LAYOUT[room];
  const inset = 1.5;
  if (door.x === rect.x + rect.w) {
    const x = (rect.x + rect.w) * UNIT;
    return { side: 'east', x1: x, y1: door.y * UNIT + inset, x2: x, y2: (door.y + 1) * UNIT - inset };
  }
  if (door.x === rect.x - 1) {
    const x = rect.x * UNIT;
    return { side: 'west', x1: x, y1: door.y * UNIT + inset, x2: x, y2: (door.y + 1) * UNIT - inset };
  }
  if (door.y === rect.y + rect.h) {
    const y = (rect.y + rect.h) * UNIT;
    return { side: 'south', x1: door.x * UNIT + inset, y1: y, x2: (door.x + 1) * UNIT - inset, y2: y };
  }
  const y = rect.y * UNIT;
  return { side: 'north', x1: door.x * UNIT + inset, y1: y, x2: (door.x + 1) * UNIT - inset, y2: y };
}

/** The corner a room's secret passage sits in: the one facing the room it leads to. */
export function passageCorner(room: RoomId): Point | null {
  const target = ROOM_LAYOUT[room].passage;
  if (!target) {
    return null;
  }
  const r = rectUnits(ROOM_LAYOUT[room].rect);
  const to = roomCenter(target);
  const from = roomCenter(room);
  return { x: to.x > from.x ? r.x + r.w - 7 : r.x + 7, y: to.y > from.y ? r.y + r.h - 7 : r.y + 7 };
}
