import type { EventMessage, GameEvent, PublicSeat, PublicTurn, TableSnapshot, YouView } from '../../src/protocol.js';
import { startPositions } from '../../src/rules/board.js';
import type { RoomId, WeaponId } from '../../src/rules/types.js';

export const WEAPONS_AT: Record<WeaponId, RoomId> = {
  telescope: 'observatory',
  vial: 'gallery',
  saber: 'greenhouse',
  raygun: 'laboratory',
  trophy: 'music',
  bust: 'theater',
};

export function seat(overrides: Partial<PublicSeat> = {}): PublicSeat {
  return {
    seatId: '1',
    occupied: true,
    displayName: 'Inspector',
    avatarId: 12,
    isLocal: true,
    connected: true,
    awaySince: null,
    suspect: 'vesper',
    ready: true,
    isHost: true,
    eliminated: false,
    handSize: 6,
    ...overrides,
  };
}

export function turn(overrides: Partial<PublicTurn> = {}): PublicTurn {
  return { phase: 'start', dice: null, enteredRoom: null, suggestion: null, refuterSeatId: null, passed: [], ...overrides };
}

export function you(overrides: Partial<YouView> = {}): YouView {
  return { seatId: '1', suspect: 'vesper', hand: ['finch', 'vial', 'parlor', 'rook', 'cellar', 'saber'], refute: null, pulledIn: false, ...overrides };
}

/** Three detectives mid-case: seat 1 (Inspector, Vesper) is the viewer and the one whose turn it is. */
export function snapshot(overrides: Partial<TableSnapshot> = {}): TableSnapshot {
  return {
    type: 'table_snapshot',
    tableId: 'table-1',
    version: 1,
    tableName: 'Midnight',
    gameNumber: 1,
    status: 'playing',
    seats: [
      seat(),
      seat({ seatId: '2', displayName: 'Sleuth', avatarId: 40, isLocal: false, suspect: 'finch', isHost: false }),
      seat({ seatId: '3', displayName: 'Gumshoe', avatarId: 41, isLocal: false, suspect: 'rook', isHost: false }),
      seat({ seatId: '4', occupied: false, displayName: null, avatarId: null, isLocal: false, suspect: null, ready: false, isHost: false, handSize: null }),
      seat({ seatId: '5', occupied: false, displayName: null, avatarId: null, isLocal: false, suspect: null, ready: false, isHost: false, handSize: null }),
      seat({ seatId: '6', occupied: false, displayName: null, avatarId: null, isLocal: false, suspect: null, ready: false, isHost: false, handSize: null }),
    ],
    hostSeatId: '1',
    players: ['1', '2', '3'],
    currentSeatId: '1',
    turnNumber: 1,
    turn: turn(),
    nextActionAt: 0,
    serverTs: 1_000,
    positions: startPositions(),
    weapons: { ...WEAPONS_AT },
    pulledIn: [],
    revealedCards: [],
    log: [],
    winnerSeatId: null,
    endReason: null,
    solution: null,
    you: you(),
    ...overrides,
  };
}

/** The same table before the case: nobody has a board, hand, or turn yet. */
export function setupSnapshot(overrides: Partial<TableSnapshot> = {}): TableSnapshot {
  const base = snapshot();
  return snapshot({
    status: 'setup',
    seats: base.seats.map((s) => ({ ...s, ready: false, handSize: null })),
    players: [],
    currentSeatId: null,
    turnNumber: 0,
    turn: null,
    nextActionAt: null,
    positions: null,
    weapons: null,
    you: you({ hand: [] }),
    ...overrides,
  });
}

type Base = Pick<GameEvent, 'eventId' | 'gameNumber' | 'seq' | 'serverTs' | 'delayMs' | 'animationMs'>;

/** Any one event kind, with the shared fields optional. */
type EventInput = GameEvent extends infer E ? (E extends GameEvent ? Omit<E, keyof Base> & Partial<Base> : never) : never;

let seq = 0;

/** Wraps an event (with defaults for the shared fields) as the server's `event` message. */
export function eventMessage(event: EventInput, overrides: Partial<Omit<EventMessage, 'event'>> = {}): EventMessage {
  const n = event.seq ?? ++seq;
  const full = {
    eventId: `1-${n}`,
    gameNumber: 1,
    seq: n,
    serverTs: 10_000,
    delayMs: 0,
    animationMs: 1400,
    ...event,
  } as unknown as GameEvent;
  return { type: 'event', tableId: 'table-1', event: full, currentSeatId: '1', nextActionAt: full.serverTs + full.delayMs + full.animationMs, ...overrides };
}
