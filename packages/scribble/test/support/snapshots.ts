import type { Tile } from '../../src/rules/types.js';
import type { PublicSeat, TableSnapshot } from '../../src/runtime/types.js';

export function seat(seatId: string, overrides: Partial<PublicSeat> = {}): PublicSeat {
  return {
    seatId,
    occupied: true,
    displayName: `Player ${seatId}`,
    avatarId: 1,
    signedIn: false,
    score: 0,
    rackCount: 7,
    inGame: true,
    isLocal: false,
    connected: true,
    awaySince: null,
    ...overrides,
  };
}

export function snapshot(overrides: Partial<TableSnapshot> & { rack?: Tile[] } = {}): TableSnapshot {
  const { rack, ...rest } = overrides;
  return {
    type: 'table_snapshot',
    tableId: 'table-1',
    version: 1,
    tableName: 'Inkwell',
    themeId: 'default',
    maxSeats: 4,
    gameNumber: 1,
    status: 'playing',
    seats: [seat('1', { isLocal: true }), seat('2'), seat('3', { occupied: false, displayName: null, avatarId: null, inGame: false, rackCount: 0, connected: false }), seat('4', { occupied: false, displayName: null, avatarId: null, inGame: false, rackCount: 0, connected: false })],
    board: [],
    bagCount: 86,
    currentSeatId: '1',
    turnNumber: 0,
    scorelessTurns: 0,
    lastTurn: null,
    endReason: null,
    finalAdjustments: null,
    wentOutSeatId: null,
    you: rack ? { seatId: '1', rack } : { seatId: '1', rack: [] },
    ...rest,
  };
}
