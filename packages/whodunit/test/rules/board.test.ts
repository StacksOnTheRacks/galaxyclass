import { describe, expect, it } from 'vitest';
import {
  BOARD_COLS,
  BOARD_ROWS,
  CASE_FILE,
  cellKey,
  cellKind,
  doorsAt,
  hallNeighbors,
  inRect,
  isHall,
  occupiedHalls,
  pathTo,
  reachable,
  ROOM_LAYOUT,
  START_CELLS,
  startPositions,
  type Reach,
} from '../../src/rules/board.js';
import { ROOM_IDS, SUSPECT_IDS } from '../../src/rules/constants.js';
import type { RoomId, TokenPosition } from '../../src/rules/types.js';

const hall = (x: number, y: number): TokenPosition => ({ kind: 'hall', x, y });
const room = (id: RoomId): TokenPosition => ({ kind: 'room', room: id });
const roomsIn = (reaches: Reach[]) =>
  reaches.flatMap((r) => (r.destination.kind === 'room' ? [`${r.destination.room}:${r.steps}`] : []));

/** Each step of a path is one square over, through a door, or (only as a whole move) a passage. */
function isWalk(path: TokenPosition[]): boolean {
  return path.every((step, i) => {
    if (i === 0) return true;
    const prev = path[i - 1]!;
    if (step.kind === 'hall' && prev.kind === 'hall') return Math.abs(step.x - prev.x) + Math.abs(step.y - prev.y) === 1;
    if (step.kind === 'room' && prev.kind === 'hall') return doorsAt(prev).includes(step.room);
    if (step.kind === 'hall' && prev.kind === 'room') return ROOM_LAYOUT[prev.room].doors.some((d) => d.x === step.x && d.y === step.y);
    return false;
  });
}

describe('Starfall Manor', () => {
  it('lays nine rooms and the case file on a 24×24 board without overlap', () => {
    const owners = new Map<string, string>();
    for (const id of ROOM_IDS) {
      const { rect } = ROOM_LAYOUT[id];
      expect(rect.x + rect.w).toBeLessThanOrEqual(BOARD_COLS);
      expect(rect.y + rect.h).toBeLessThanOrEqual(BOARD_ROWS);
      for (let y = rect.y; y < rect.y + rect.h; y++) {
        for (let x = rect.x; x < rect.x + rect.w; x++) {
          expect(owners.has(`${x},${y}`)).toBe(false);
          expect(inRect(CASE_FILE, x, y)).toBe(false);
          owners.set(`${x},${y}`, id);
        }
      }
    }
    expect(cellKind(12, 12)).toBe('case');
    expect(cellKind(-1, 0)).toBe('void');
  });

  it('puts every door and starting square on the hallway, and the hallway in one piece', () => {
    for (const id of ROOM_IDS) {
      expect(ROOM_LAYOUT[id].doors.length).toBeGreaterThan(0);
      for (const door of ROOM_LAYOUT[id].doors) expect(isHall(door.x, door.y)).toBe(true);
    }
    for (const id of SUSPECT_IDS) expect(isHall(START_CELLS[id].x, START_CELLS[id].y)).toBe(true);
    expect(new Set(SUSPECT_IDS.map((id) => cellKey(START_CELLS[id]))).size).toBe(SUSPECT_IDS.length);

    const halls: string[] = [];
    for (let y = 0; y < BOARD_ROWS; y++) for (let x = 0; x < BOARD_COLS; x++) if (isHall(x, y)) halls.push(`${x},${y}`);
    const seen = new Set([halls[0]!]);
    const queue = [halls[0]!];
    while (queue.length) {
      const [x, y] = queue.shift()!.split(',').map(Number) as [number, number];
      for (const next of hallNeighbors({ x, y })) {
        if (!seen.has(cellKey(next))) {
          seen.add(cellKey(next));
          queue.push(cellKey(next));
        }
      }
    }
    expect(seen.size).toBe(halls.length);
  });

  it('joins the corner rooms by two two-way secret passages', () => {
    expect(ROOM_LAYOUT.observatory.passage).toBe('parlor');
    expect(ROOM_LAYOUT.parlor.passage).toBe('observatory');
    expect(ROOM_LAYOUT.greenhouse.passage).toBe('cellar');
    expect(ROOM_LAYOUT.cellar.passage).toBe('greenhouse');
    expect(ROOM_IDS.filter((id) => ROOM_LAYOUT[id].passage)).toHaveLength(4);
  });

  it('starts every suspect on their own square', () => {
    expect(startPositions().vesper).toEqual(hall(7, 0));
    expect(occupiedHalls(startPositions()).size).toBe(6);
    expect(occupiedHalls(startPositions(), 'vesper').has('7,0')).toBe(false);
  });
});

describe('moving', () => {
  it('reaches any square up to the roll, never diagonally, and rooms for one more step through a door', () => {
    const reach = reachable(hall(7, 0), 4, new Set());
    expect(reach.every((r) => r.steps <= 4 && isWalk(r.path))).toBe(true);
    expect(reach.some((r) => r.destination.kind === 'hall' && r.destination.x === 7 && r.destination.y === 4)).toBe(true);
    expect(roomsIn(reach)).toEqual(['observatory:4']);
    expect(roomsIn(reachable(hall(7, 0), 3, new Set()))).toEqual([]);
    expect(roomsIn(reachable(hall(7, 0), 5, new Set()))).toEqual(['observatory:4', 'gallery:5']);
  });

  it('enters a room from the square outside its door with a single step', () => {
    expect(pathTo(hall(6, 2), room('observatory'), 1, new Set())).toEqual([hall(6, 2), room('observatory')]);
  });

  it('never walks through or onto another token', () => {
    const blocked = new Set(['7,1', '6,0']);
    expect(reachable(hall(7, 0), 6, blocked)).toEqual([]);
    expect(pathTo(hall(7, 0), hall(7, 3), 3, new Set(['7,2']))).toBeNull();
    expect(pathTo(hall(6, 2), room('observatory'), 1, new Set(['6,2']))).toEqual([hall(6, 2), room('observatory')]);
    expect(pathTo(hall(7, 2), room('observatory'), 2, new Set(['6,2']))).toBeNull();
  });

  it('leaves a room by any open door and never comes back in the same move', () => {
    const reach = reachable(room('observatory'), 7, new Set());
    expect(reach.every((r) => r.path[0]!.kind === 'room' && isWalk(r.path))).toBe(true);
    expect(roomsIn(reach)).toEqual(['gallery:5', 'laboratory:5']);
    expect(reach.find((r) => r.destination.kind === 'hall' && r.destination.x === 6 && r.destination.y === 2)?.steps).toBe(1);
    expect(reachable(room('observatory'), 7, new Set(['6,2', '3,6']))).toEqual([]);
  });

  it('can rule out a room the turn started in', () => {
    expect(roomsIn(reachable(hall(6, 2), 4, new Set()))).toEqual(['observatory:1', 'gallery:4']);
    expect(roomsIn(reachable(hall(6, 2), 4, new Set(), { excludeRoom: 'observatory' }))).toEqual(['gallery:4']);
  });

  it('always finds the same shortest path', () => {
    const a = pathTo(hall(0, 16), room('foyer'), 12, new Set());
    const b = pathTo(hall(0, 16), room('foyer'), 12, new Set());
    expect(a).toEqual(b);
    expect(a).not.toBeNull();
    expect(isWalk(a!)).toBe(true);
    expect(a!.length - 1).toBe(Math.min(...reachable(hall(0, 16), 12, new Set()).filter((r) => r.destination.kind === 'room' && r.destination.room === 'foyer').map((r) => r.steps)));
  });
});
