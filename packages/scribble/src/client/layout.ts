import { BOARD_SIZE } from '../rules/board.js';
import { RACK_SIZE } from '../rules/tiles.js';

/** Board world units. The board camera scales these to the screen. */
export const CELL = 48;
export const FRAME = 18;
export const BOARD_PX = BOARD_SIZE * CELL + FRAME * 2;

/** Heights of the DOM bars laid over the canvas; the stylesheet uses the same numbers. */
export const TOP_BAR = 64;
export const CONTROL_BAR = 64;
const GUTTER = 8;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Layout {
  width: number;
  height: number;
  board: Rect;
  rack: Rect;
  tileSize: number;
}

/**
 * `width`/`height` are canvas pixels; `unit` is canvas pixels per CSS pixel (the device pixel
 * ratio), so the canvas regions line up with the DOM bars at any density.
 */
export function layoutFor(width: number, height: number, unit = 1): Layout {
  const cssWidth = width / unit;
  const tileSize = Math.round(Math.max(32, Math.min(58, Math.floor((cssWidth - 32) / (RACK_SIZE + 0.8)))) * unit);
  const rackHeight = tileSize + Math.round(20 * unit);
  const rackY = height - CONTROL_BAR * unit - rackHeight;
  const gutter = GUTTER * unit;
  const boardY = TOP_BAR * unit + gutter;
  return {
    width,
    height,
    tileSize,
    rack: { x: 0, y: rackY, width, height: rackHeight },
    board: {
      x: gutter,
      y: boardY,
      width: Math.max(1, width - gutter * 2),
      height: Math.max(1, rackY - gutter - boardY),
    },
  };
}

export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

/** Top-left corner of a square in board world units. */
export function cellOrigin(row: number, col: number): { x: number; y: number } {
  return { x: FRAME + col * CELL, y: FRAME + row * CELL };
}

export function cellCenter(row: number, col: number): { x: number; y: number } {
  const origin = cellOrigin(row, col);
  return { x: origin.x + CELL / 2, y: origin.y + CELL / 2 };
}

/** The square under a board world point, or null off the grid. */
export function cellAt(worldX: number, worldY: number): { row: number; col: number } | null {
  const col = Math.floor((worldX - FRAME) / CELL);
  const row = Math.floor((worldY - FRAME) / CELL);
  if (row < 0 || col < 0 || row >= BOARD_SIZE || col >= BOARD_SIZE) {
    return null;
  }
  return { row, col };
}

/** Screen-space centre of each rack slot, left to right, centred in the rack strip. */
export function rackSlots(layout: Layout, count = RACK_SIZE): Array<{ x: number; y: number }> {
  const gap = Math.round(layout.tileSize * 0.12);
  const span = count * layout.tileSize + (count - 1) * gap;
  const left = (layout.width - span) / 2 + layout.tileSize / 2;
  const y = layout.rack.y + layout.rack.height / 2;
  return Array.from({ length: count }, (_, i) => ({ x: left + i * (layout.tileSize + gap), y }));
}

/** Index of the rack slot under a screen point, if any. */
export function rackSlotAt(layout: Layout, x: number, y: number, count = RACK_SIZE): number | null {
  if (!contains(layout.rack, x, y)) {
    return null;
  }
  const half = layout.tileSize / 2;
  const slots = rackSlots(layout, count);
  const index = slots.findIndex((slot) => Math.abs(slot.x - x) <= half && Math.abs(slot.y - y) <= half);
  return index === -1 ? null : index;
}

/** Nearest rack slot by x, used to drop a tile back into a chosen place in the rack. */
export function nearestRackSlot(layout: Layout, x: number, count = RACK_SIZE): number {
  const slots = rackSlots(layout, count);
  let best = 0;
  for (let i = 1; i < slots.length; i++) {
    if (Math.abs(slots[i]!.x - x) < Math.abs(slots[best]!.x - x)) {
      best = i;
    }
  }
  return best;
}
