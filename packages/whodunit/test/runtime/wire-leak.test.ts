import { beforeAll, describe, expect, it } from 'vitest';
import type { GameEvent, ServerMessage, TableSnapshot } from '../../src/protocol.js';
import type { SeatId } from '../../src/rules/types.js';
import { seededRandom } from '../../src/rules/random.js';
import { playOut, playStep } from '../support/play.js';
import { Harness } from '../support/runtime-harness.js';

const PLAYERS = ['a', 'b', 'c', 'd'];
const PUBLIC_SEAT_KEYS = [
  'avatarId',
  'awaySince',
  'connected',
  'displayName',
  'eliminated',
  'handSize',
  'isHost',
  'isLocal',
  'occupied',
  'ready',
  'seatId',
  'suspect',
].sort();

let h: Harness;
/** The card actually shown, by event id, from the server's own log. */
let shown: Map<string, { suggester: SeatId; refuter: SeatId; card: string }>;
let leaverHand: string[];
let leaverFramesAtExit: number;

/**
 * Four detectives play a whole case to the end while a member watches without a seat and a fifth
 * detective walks out mid-case.
 */
beforeAll(async () => {
  h = new Harness();
  await h.seed();
  await h.connect('outsider');
  await h.join('outsider');
  await h.setupCase([...PLAYERS, 'e']);

  const random = seededRandom(20261008);
  for (let i = 0; i < 25; i++) await playStep(h, random, 60);
  leaverHand = [...h.game().hands['5']!];
  h.openTurn();
  await h.act('e', 'leave');
  leaverFramesAtExit = h.messages('e').length;
  await h.connect('late');
  await h.join('late');
  await playOut(h, random, 40);

  shown = new Map();
  for (const event of h.game().log) {
    if (event.kind === 'refuted') {
      shown.set(event.eventId, { suggester: event.suggesterSeatId, refuter: event.refuterSeatId, card: event.card! });
    }
  }
});

/** Every event a connection was ever sent: live, in snapshot logs, and in the recap. */
function eventsSeenBy(conn: string): GameEvent[] {
  return h.messages(conn).flatMap((m): GameEvent[] => {
    if (m.type === 'event') return [m.event];
    if (m.type === 'table_snapshot') return [...m.log, ...(m.recap?.events ?? [])];
    return [];
  });
}

function snapshotsOf(conn: string): TableSnapshot[] {
  return h.messages(conn).filter((m): m is TableSnapshot => m.type === 'table_snapshot');
}

describe('wire leaks over a whole case', () => {
  it('actually played a case with private refutations to check', () => {
    expect(h.game().status).toBe('finished');
    expect(h.game().departed).toContain('5');
    expect(shown.size).toBeGreaterThan(3);
    const bystanders = [...shown.values()].filter((s) => s.suggester !== '1' && s.refuter !== '1');
    expect(bystanders.length).toBeGreaterThan(0);
  });

  it('never shows the case file before the case ends', () => {
    for (const conn of [...PLAYERS, 'e', 'outsider', 'late']) {
      let finished = false;
      for (const m of h.messages(conn)) {
        if (m.type === 'event' && m.event.kind === 'game_over') finished = true;
        if (m.type === 'table_snapshot') {
          if (m.status === 'finished') finished = true;
          if (!finished) {
            expect(m.solution).toBeNull();
            expect(m.recap).toBeUndefined();
          }
        }
      }
    }
  });

  it('never sends a detective anyone else’s hand while the case is open', () => {
    for (const [i, conn] of PLAYERS.entries()) {
      const seatId = String(i + 1) as SeatId;
      const hand = h.game().hands[seatId]!;
      expect(snapshotsOf(conn).filter((m) => m.status === 'playing').length).toBeGreaterThan(20);
      expect(snapshotsOf(conn).some((m) => m.you?.refute)).toBe(true);
      for (const m of h.messages(conn)) {
        if (m.type === 'table_snapshot' && m.status === 'playing') {
          expect(m.you!.hand).toEqual(hand);
          for (const card of m.you!.refute?.matching ?? []) expect(hand).toContain(card);
          expect(JSON.stringify(m)).not.toContain('"hands"');
          for (const seat of m.seats) {
            if (seat.occupied) expect(seat.handSize).toBe(h.game().hands[seat.seatId]?.length ?? null);
          }
        }
      }
    }
  });

  it('shows a refuting card only to the suggester and the refuter, live, in logs, and in the recap', () => {
    for (const [i, conn] of PLAYERS.entries()) {
      const seatId = String(i + 1) as SeatId;
      const refutations = eventsSeenBy(conn).filter((e) => e.kind === 'refuted');
      expect(refutations.length).toBeGreaterThan(0);
      for (const event of refutations) {
        const truth = shown.get(event.eventId)!;
        if (truth.suggester === seatId || truth.refuter === seatId) {
          expect(event.card).toBe(truth.card);
        } else {
          expect(event).not.toHaveProperty('card');
        }
      }
    }
  });

  it('gives the recap, with every hand and the case file, only to detectives who played the case', () => {
    for (const conn of PLAYERS) {
      const last = snapshotsOf(conn).at(-1)!;
      expect(last.solution).toEqual(h.game().solution);
      expect(last.recap!.solution).toEqual(h.game().solution);
      expect(Object.keys(last.recap!.hands).sort()).toEqual(['1', '2', '3', '4', '5']);
    }
    for (const conn of ['outsider', 'late', 'e']) {
      const last = snapshotsOf(conn).at(-1)!;
      expect(last).toMatchObject({ status: 'finished', solution: null, you: null, positions: null, weapons: null, log: [] });
      expect(last.recap).toBeUndefined();
    }
  });

  it('sends a member without a seat no events, board, log, or turn', () => {
    for (const conn of ['outsider', 'late']) {
      expect(h.events(conn)).toEqual([]);
      for (const snap of snapshotsOf(conn)) {
        expect(snap).toMatchObject({ you: null, log: [], pulledIn: [], revealedCards: [], solution: null, turn: null });
        if (snap.status !== 'setup') expect(snap).toMatchObject({ positions: null, weapons: null });
      }
    }
  });

  it('stops sending events to a detective the moment they leave, after laying their cards face up', () => {
    const after = h.messages('e').slice(leaverFramesAtExit);
    expect(after.filter((m) => m.type === 'event')).toEqual([]);
    const departed = eventsSeenBy('a').find((e) => e.kind === 'departed');
    expect(departed).toMatchObject({ seatId: '5', reason: 'left', revealed: leaverHand });
    expect(snapshotsOf('a').at(-1)!.revealedCards).toEqual(leaverHand);
  });

  it('never puts a sub, a seat-token hash, a connection id, or another seat’s token on the wire', () => {
    const tokens = [...h.tokens.entries()];
    for (const conn of [...PLAYERS, 'e', 'outsider', 'late']) {
      for (const frame of h.wire.get(conn) ?? []) {
        const message = JSON.parse(frame) as ServerMessage;
        expect(frame).not.toMatch(/sub-|seatTokenHash|playerSub|connectionId/);
        if (message.type === 'sat') continue;
        expect(frame).not.toMatch(/seatToken/);
        for (const [, token] of tokens) expect(frame).not.toContain(token);
      }
    }
  });

  it('describes every seat with exactly the public seat fields', () => {
    for (const conn of [...PLAYERS, 'outsider']) {
      for (const snap of snapshotsOf(conn)) {
        for (const seat of snap.seats) expect(Object.keys(seat).sort()).toEqual(PUBLIC_SEAT_KEYS);
      }
    }
  });
});
