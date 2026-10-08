import { ROOM_IDS, SUSPECT_IDS } from './constants.js';
import type { Cell, Destination, RoomId, SuspectId, TokenPosition } from './types.js';

/**
 * Starfall Manor, top-down. The board is BOARD_COLS × BOARD_ROWS squares; rooms are rectangles of
 * squares, the case file sits in the middle (nobody walks through it), and every other square is
 * hallway. A door joins a room to the one hallway square outside it.
 */
export const BOARD_COLS = 24;
export const BOARD_ROWS = 24;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RoomLayout {
  rect: Rect;
  /** The hallway square just outside each door. */
  doors: Cell[];
  /** The corner room a secret passage leads to. */
  passage?: RoomId;
}

export const ROOM_LAYOUT: Readonly<Record<RoomId, RoomLayout>> = {
  observatory: { rect: { x: 0, y: 0, w: 6, h: 6 }, doors: [{ x: 6, y: 2 }, { x: 3, y: 6 }], passage: 'parlor' },
  gallery: {
    rect: { x: 8, y: 0, w: 8, h: 7 },
    doors: [
      { x: 7, y: 4 },
      { x: 16, y: 4 },
      { x: 10, y: 7 },
      { x: 13, y: 7 },
    ],
  },
  greenhouse: { rect: { x: 18, y: 0, w: 6, h: 6 }, doors: [{ x: 17, y: 3 }, { x: 20, y: 6 }], passage: 'cellar' },
  laboratory: { rect: { x: 0, y: 9, w: 6, h: 6 }, doors: [{ x: 2, y: 8 }, { x: 6, y: 12 }] },
  music: { rect: { x: 18, y: 7, w: 6, h: 5 }, doors: [{ x: 17, y: 9 }, { x: 21, y: 12 }] },
  theater: { rect: { x: 18, y: 13, w: 6, h: 5 }, doors: [{ x: 17, y: 15 }, { x: 20, y: 12 }] },
  cellar: { rect: { x: 0, y: 18, w: 6, h: 6 }, doors: [{ x: 3, y: 17 }, { x: 6, y: 20 }], passage: 'greenhouse' },
  foyer: {
    rect: { x: 8, y: 17, w: 8, h: 7 },
    doors: [
      { x: 11, y: 16 },
      { x: 12, y: 16 },
      { x: 7, y: 20 },
      { x: 16, y: 20 },
    ],
  },
  parlor: { rect: { x: 18, y: 19, w: 6, h: 5 }, doors: [{ x: 20, y: 18 }, { x: 17, y: 21 }], passage: 'observatory' },
};

/** The case file and the grand staircase around it. Impassable. */
export const CASE_FILE: Rect = { x: 9, y: 9, w: 6, h: 6 };

/** Each suspect's token starts on its own hallway square at the edge of the board. */
export const START_CELLS: Readonly<Record<SuspectId, Cell>> = {
  vesper: { x: 7, y: 0 },
  finch: { x: 16, y: 0 },
  juniper: { x: 23, y: 6 },
  rook: { x: 23, y: 18 },
  duarte: { x: 7, y: 23 },
  thorne: { x: 0, y: 16 },
};

export type CellKind = 'hall' | 'room' | 'case' | 'void';

export function inRect(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

export function roomAt(x: number, y: number): RoomId | null {
  return ROOM_IDS.find((id) => inRect(ROOM_LAYOUT[id].rect, x, y)) ?? null;
}

export function cellKind(x: number, y: number): CellKind {
  if (x < 0 || y < 0 || x >= BOARD_COLS || y >= BOARD_ROWS) {
    return 'void';
  }
  if (inRect(CASE_FILE, x, y)) {
    return 'case';
  }
  return roomAt(x, y) ? 'room' : 'hall';
}

export function isHall(x: number, y: number): boolean {
  return cellKind(x, y) === 'hall';
}

export function cellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}

export function samePosition(a: TokenPosition, b: TokenPosition): boolean {
  return a.kind === 'room' ? b.kind === 'room' && a.room === b.room : b.kind === 'hall' && a.x === b.x && a.y === b.y;
}

export function positionKey(position: TokenPosition): string {
  return position.kind === 'room' ? `room:${position.room}` : `hall:${position.x},${position.y}`;
}

/** The room a door's hallway square opens into, or null when the square is not outside a door. */
export function doorsAt(cell: Cell): RoomId[] {
  return ROOM_IDS.filter((id) => ROOM_LAYOUT[id].doors.some((door) => door.x === cell.x && door.y === cell.y));
}

const STEPS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export function hallNeighbors(cell: Cell): Cell[] {
  return STEPS.map(([dx, dy]) => ({ x: cell.x + dx, y: cell.y + dy })).filter((next) => isHall(next.x, next.y));
}

export function startPositions(): Record<SuspectId, TokenPosition> {
  return Object.fromEntries(SUSPECT_IDS.map((id) => [id, { kind: 'hall', ...START_CELLS[id] }])) as Record<
    SuspectId,
    TokenPosition
  >;
}

/** Hallway squares that hold a token. Rooms never fill up. */
export function occupiedHalls(positions: Readonly<Record<SuspectId, TokenPosition>>, except?: SuspectId): Set<string> {
  const taken = new Set<string>();
  for (const id of SUSPECT_IDS) {
    const position = positions[id];
    if (id !== except && position.kind === 'hall') {
      taken.add(cellKey(position));
    }
  }
  return taken;
}

export interface Reach {
  destination: Destination;
  /** Every position the token passes through, starting where it stands and ending at the destination. */
  path: TokenPosition[];
  steps: number;
}

/**
 * Where a token may go with `steps` squares of movement (up to the roll, never diagonally, never
 * through or onto another token's square). Entering a room ends the move and costs the step through
 * the door. A token in a room leaves by any unblocked door, and may not come back in the same turn.
 * Shortest paths are found breadth-first in a fixed neighbour order, so the same board always gives
 * the same path.
 */
export function reachable(
  from: TokenPosition,
  steps: number,
  occupied: ReadonlySet<string>,
  options: { excludeRoom?: RoomId | null } = {},
): Reach[] {
  const results: Reach[] = [];
  const parents = new Map<string, TokenPosition[]>();
  const queue: Array<{ cell: Cell; path: TokenPosition[] }> = [];
  const leaving = from.kind === 'room' ? from.room : null;
  const excluded = new Set<RoomId>([...(options.excludeRoom ? [options.excludeRoom] : []), ...(leaving ? [leaving] : [])]);

  if (from.kind === 'room') {
    for (const door of ROOM_LAYOUT[from.room].doors) {
      const key = cellKey(door);
      if (!occupied.has(key) && !parents.has(key) && steps >= 1) {
        const path: TokenPosition[] = [from, { kind: 'hall', ...door }];
        parents.set(key, path);
        queue.push({ cell: door, path });
      }
    }
  } else {
    parents.set(cellKey(from), [from]);
    queue.push({ cell: from, path: [from] });
  }

  const rooms = new Map<RoomId, TokenPosition[]>();
  while (queue.length > 0) {
    const { cell, path } = queue.shift()!;
    const used = path.length - 1;
    if (path.length > 1) {
      results.push({ destination: path.at(-1)!, path, steps: used });
    }
    if (used >= steps) {
      continue;
    }
    for (const room of doorsAt(cell)) {
      if (!excluded.has(room) && !rooms.has(room)) {
        rooms.set(room, [...path, { kind: 'room', room }]);
      }
    }
    for (const next of hallNeighbors(cell)) {
      const key = cellKey(next);
      if (occupied.has(key) || parents.has(key)) {
        continue;
      }
      const nextPath: TokenPosition[] = [...path, { kind: 'hall', ...next }];
      parents.set(key, nextPath);
      queue.push({ cell: next, path: nextPath });
    }
  }
  for (const id of ROOM_IDS) {
    const path = rooms.get(id);
    if (path) {
      results.push({ destination: { kind: 'room', room: id }, path, steps: path.length - 1 });
    }
  }
  return results;
}

/** The path to `to`, or null when it is out of reach. */
export function pathTo(
  from: TokenPosition,
  to: Destination,
  steps: number,
  occupied: ReadonlySet<string>,
  options: { excludeRoom?: RoomId | null } = {},
): TokenPosition[] | null {
  return reachable(from, steps, occupied, options).find((reach) => samePosition(reach.destination, to))?.path ?? null;
}

/** Centre of a square or room, in board units (one square = 1). */
export function positionCenter(position: TokenPosition): { x: number; y: number } {
  if (position.kind === 'hall') {
    return { x: position.x + 0.5, y: position.y + 0.5 };
  }
  const { rect } = ROOM_LAYOUT[position.room];
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}
