import type { TurnRecord } from '../../src/rules/game.js';
import type { TableSnapshot } from '../../src/runtime/types.js';
import { seat, snapshot } from './snapshots.js';

export function turn(turnNumber: number, seatId: string, score: number, overrides: Partial<TurnRecord> = {}): TurnRecord {
  return {
    turnNumber,
    seatId,
    kind: 'play',
    words: [],
    tiles: 0,
    blanks: 0,
    premiums: [],
    total: 0,
    bingo: false,
    exchanged: 0,
    score,
    ...overrides,
  };
}

const emptySeat = (seatId: string) =>
  seat(seatId, { occupied: false, displayName: null, avatarId: null, inGame: false, rackCount: 0, connected: false });

/** Alice (you) goes out and beats Bob; Cara bingoed early, then left mid-game. */
export function wonGame(overrides: Partial<TableSnapshot> = {}): TableSnapshot {
  return snapshot({
    status: 'ended',
    currentSeatId: null,
    endReason: 'played_out',
    wentOutSeatId: '1',
    finalAdjustments: { 1: 5, 2: -5 },
    turnNumber: 8,
    seats: [
      seat('1', { displayName: 'Alice', isLocal: true, score: 93 }),
      seat('2', { displayName: 'Bob', score: 23 }),
      emptySeat('3'),
      emptySeat('4'),
    ],
    recap: {
      history: [
        turn(1, '1', 48, { words: [{ text: 'QUART', score: 48 }], tiles: 5, premiums: ['DL', 'DW'], total: 48 }),
        turn(2, '2', 8, { words: [{ text: 'AT', score: 4 }, { text: 'AT', score: 4 }], tiles: 1, premiums: ['DW'], total: 8 }),
        turn(3, '3', 66, { words: [{ text: 'RETAINS', score: 66 }], tiles: 7, blanks: 1, bingo: true, total: 66 }),
        turn(4, '1', 70, { words: [{ text: 'ZA', score: 22 }], tiles: 2, premiums: ['TL'], total: 22 }),
        turn(5, '2', 8, { kind: 'exchange', exchanged: 3 }),
        turn(6, '3', 66, { kind: 'auto_pass' }),
        turn(7, '1', 88, { words: [{ text: 'OX', score: 9 }, { text: 'XI', score: 9 }], tiles: 1, total: 18 }),
        turn(8, '2', 28, { words: [{ text: 'EXCITING', score: 20 }], tiles: 4, total: 20 }),
      ],
      finalScores: { 1: 93, 2: 23 },
      roster: {
        1: { displayName: 'Alice', avatarId: 3 },
        2: { displayName: 'Bob', avatarId: 4 },
        3: { displayName: 'Cara', avatarId: 5 },
      },
      startedAt: '2026-10-04T12:00:00.000Z',
      endedAt: '2026-10-04T12:42:10.000Z',
    },
    ...overrides,
  });
}
