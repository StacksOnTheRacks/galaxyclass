import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServerMessage, TableSnapshot } from '../../src/protocol.js';
import { BOARD_SIZE } from '../../src/rules/constants.js';
import { randomFleet, shipCells } from '../../src/rules/fleet.js';
import { seededRandom } from '../../src/rules/random.js';
import type { Fleet, SeatId, ShipId } from '../../src/rules/types.js';
import { Harness, TABLE_ID } from '../support/runtime-harness.js';

afterEach(() => vi.restoreAllMocks());

type Json = unknown;

/** Every object in a frame, with the path that reached it. */
function walk(value: Json, path: string[] = [], out: Array<{ path: string[]; node: Record<string, Json> }> = []) {
  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, [...path, String(i)], out));
  } else if (typeof value === 'object' && value !== null) {
    out.push({ path, node: value as Record<string, Json> });
    for (const [key, child] of Object.entries(value)) walk(child, [...path, key], out);
  }
  return out;
}

function samePlacement(node: Record<string, Json>, fleet: Fleet, shipId: ShipId): boolean {
  const ship = fleet.find((s) => s.shipId === shipId)!;
  return node.row === ship.row && node.col === ship.col && node.orientation === ship.orientation;
}

/** Two seeded fleets that share no identical placement, so a leaked placement cannot pass for the viewer's own. */
function distinctFleets(): { a: Fleet; b: Fleet } {
  for (let seed = 1; ; seed++) {
    const a = randomFleet(seededRandom(seed));
    const b = randomFleet(seededRandom(seed + 1000));
    const clash = a.some((ship) => samePlacement(ship as never, b, ship.shipId));
    if (!clash) return { a, b };
  }
}

/**
 * Plays a whole game with random fleets and random legal shots, then inspects every frame each
 * connection received, object by object, for anything it must not see.
 */
describe('hidden state on the wire', () => {
  it('never shows a captain an unsunk enemy ship, and shows a third member no board at all', async () => {
    const h = new Harness({ firstSeatId: null, seed: 7 });
    await h.seed();
    const fleets = distinctFleets();
    const tokens = { a: await h.seat('a'), b: await h.seat('b') };
    await h.connect('c');
    await h.join('c');
    await h.send('c', { action: 'sit', accessToken: h.tokenFor('c') });
    expect(h.lastError('c')).toEqual({ type: 'error', code: 'table_locked' });

    await h.place('a', tokens.a, fleets.a);
    expect(h.snapshot('a').you!.fleet).toEqual(fleets.a);
    expect(h.snapshot('b').you!.fleet).toBeNull();
    await h.place('b', tokens.b, fleets.b);
    expect(h.snapshot('b').you!.fleet).toEqual(fleets.b);

    const picker = seededRandom(99);
    const open: Record<SeatId, number[]> = {
      '1': Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => i),
      '2': Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => i),
    };
    while (h.table().game.status === 'battle') {
      h.openTurn();
      const seatId = h.table().game.currentSeatId!;
      const cells = open[seatId];
      const [cell] = cells.splice(picker.int(cells.length), 1);
      const conn = seatId === '1' ? 'a' : 'b';
      await h.fire(conn, seatId === '1' ? tokens.a : tokens.b, { row: Math.floor(cell! / BOARD_SIZE), col: cell! % BOARD_SIZE });
      expect(h.last(conn, 'shot').shooter).toBe(seatId);
    }
    expect(h.table().game.status).toBe('finished');

    const history = h.table().game.history;
    /** The turn each seat's ship went down, from the server's own record. */
    const sunkOn = (seatId: SeatId) =>
      new Map(history.filter((s) => s.target === seatId && s.sunkShip).map((s) => [s.sunkShip!.shipId, s.turnNumber]));

    const checkCaptain = (conn: 'a' | 'b', me: SeatId, opp: SeatId, oppFleet: Fleet) => {
      const sunk = sunkOn(opp);
      const frames = (h.wire.get(conn) ?? []).map((raw) => JSON.parse(raw) as ServerMessage);
      const finishedAt = frames.findIndex((f) => f.type === 'table_snapshot' && f.status === 'finished');
      expect(finishedAt).toBeGreaterThan(0);
      frames.forEach((frame, index) => {
        const snapshot = frame.type === 'table_snapshot' ? frame : null;
        if (index < finishedAt) {
          const turn = 'turnNumber' in frame ? frame.turnNumber : 0;
          for (const { path, node } of walk(frame)) {
            if (path[0] === 'you' && path[1] === 'fleet') continue;
            const shipId = node.shipId as ShipId | undefined;
            if (!shipId) continue;
            const visible = (sunk.get(shipId) ?? Infinity) <= turn;
            if (!visible) expect(samePlacement(node, oppFleet, shipId)).toBe(false);
          }
          if (snapshot?.target) expect(snapshot.target.revealed).toBeNull();
        } else if (snapshot && snapshot.status === 'finished') {
          expect(snapshot.target!.revealed).toEqual(oppFleet);
        }
        if (snapshot?.you) {
          for (const mark of [...snapshot.you.incoming, ...(snapshot.target?.shots ?? [])]) {
            expect(Object.keys(mark).sort()).toEqual(['col', 'result', 'row', 'turnNumber']);
          }
          expect(snapshot.you.seatId).toBe(me);
        }
        if (snapshot?.target) {
          const hits = new Set(snapshot.target.shots.filter((m) => m.result === 'hit').map((m) => `${m.row},${m.col}`));
          for (const ship of snapshot.target.sunk) {
            expect(shipCells(ship).every((c) => hits.has(`${c.row},${c.col}`))).toBe(true);
          }
        }
      });
    };
    checkCaptain('a', '1', '2', fleets.b);
    checkCaptain('b', '2', '1', fleets.a);

    const wire = (conn: string) => (h.wire.get(conn) ?? []).join('\n');
    for (const conn of ['a', 'b', 'c']) {
      expect(wire(conn)).not.toMatch(/seatTokenHash|playerSub|sub-|connectionId|"boards"|"history"/);
    }
    expect(wire('b')).not.toContain(tokens.a);
    expect(wire('a')).not.toContain(tokens.b);
    expect(wire('c')).not.toContain(tokens.a);
    expect(wire('c')).not.toContain(tokens.b);

    expect(h.shots('c')).toEqual([]);
    const third = h.messages('c').filter((m): m is TableSnapshot => m.type === 'table_snapshot');
    expect(third.length).toBeGreaterThan(5);
    for (const snapshot of third) {
      expect(snapshot).toMatchObject({ you: null, target: null, lastShot: null });
      expect(snapshot.recap).toBeUndefined();
    }
    expect(wire('c')).not.toMatch(/"fleet"/);
  });
});

describe('the table snapshot', () => {
  it('carries no account or connection fields on a seat', async () => {
    const h = new Harness();
    await h.seed();
    await h.seat('a');
    expect(Object.keys(h.snapshot('a').seats[0]!).sort()).toEqual([
      'avatarId',
      'awaySince',
      'connected',
      'displayName',
      'isLocal',
      'occupied',
      'ready',
      'seatId',
      'shipsAfloat',
    ]);
    expect(h.snapshot('a').tableId).toBe(TABLE_ID);
  });
});
