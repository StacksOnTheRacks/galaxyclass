import type { PublicSeat, ShotEvent, TableSnapshot } from '../../src/protocol.js';
import type { Fleet } from '../../src/rules/types.js';

/** Seat 1's fleet: every ship horizontal, bows in column 1, rows A–E. */
export const FLEET_A: Fleet = [
  { shipId: 'carrier', row: 0, col: 0, orientation: 'horizontal' },
  { shipId: 'battleship', row: 1, col: 0, orientation: 'horizontal' },
  { shipId: 'cruiser', row: 2, col: 0, orientation: 'horizontal' },
  { shipId: 'submarine', row: 3, col: 0, orientation: 'horizontal' },
  { shipId: 'destroyer', row: 4, col: 0, orientation: 'horizontal' },
];

/** Seat 2's fleet: every ship vertical, bows in row A, columns 6–10. */
export const FLEET_B: Fleet = [
  { shipId: 'carrier', row: 0, col: 5, orientation: 'vertical' },
  { shipId: 'battleship', row: 0, col: 6, orientation: 'vertical' },
  { shipId: 'cruiser', row: 0, col: 7, orientation: 'vertical' },
  { shipId: 'submarine', row: 0, col: 8, orientation: 'vertical' },
  { shipId: 'destroyer', row: 0, col: 9, orientation: 'vertical' },
];

export function seat(overrides: Partial<PublicSeat> = {}): PublicSeat {
  return {
    seatId: '1',
    occupied: true,
    displayName: 'Admiral',
    avatarId: 12,
    isLocal: true,
    connected: true,
    awaySince: null,
    ready: false,
    shipsAfloat: null,
    ...overrides,
  };
}

/** Seat 1 (Admiral) is the viewer unless overridden. */
export function snapshot(overrides: Partial<TableSnapshot> = {}): TableSnapshot {
  return {
    type: 'table_snapshot',
    tableId: 'table-1',
    version: 1,
    tableName: 'Pacific',
    gameNumber: 1,
    status: 'battle',
    seats: [
      seat({ seatId: '1', ready: true, shipsAfloat: 5 }),
      seat({ seatId: '2', displayName: 'Captain', avatarId: 40, isLocal: false, ready: true, shipsAfloat: 5 }),
    ],
    currentSeatId: '1',
    turnNumber: 0,
    turnOpensAt: 0,
    serverTs: 1_000,
    lastShot: null,
    winnerSeatId: null,
    endReason: null,
    rematchVotes: [],
    you: { seatId: '1', fleet: FLEET_A, ready: true, incoming: [] },
    target: { seatId: '2', shots: [], sunk: [], revealed: null },
    ...overrides,
  };
}

export function shotEvent(overrides: Partial<ShotEvent> = {}): ShotEvent {
  const turnNumber = overrides.turnNumber ?? 1;
  const gameNumber = overrides.gameNumber ?? 1;
  return {
    type: 'shot',
    tableId: 'table-1',
    shotId: `${gameNumber}-${turnNumber}`,
    gameNumber,
    turnNumber,
    shooter: '1',
    target: '2',
    coord: { row: 2, col: 6 },
    result: 'miss',
    gameOver: false,
    serverTs: 10_000,
    animationMs: 2200,
    nextSeatId: '2',
    turnOpensAt: 10_000 + 2200 - 300,
    winnerSeatId: null,
    ...overrides,
  };
}
