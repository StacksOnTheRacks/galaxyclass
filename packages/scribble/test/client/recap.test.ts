import { describe, expect, it } from 'vitest';
import { buildReport } from '../../src/client/recap.js';
import { wonGame } from '../support/recap-fixtures.js';
import { seat, snapshot } from '../support/snapshots.js';

describe('end-of-game report', () => {
  it('names the winner, the margin, and ranks finishers ahead of players who left', () => {
    const report = buildReport(wonGame());
    expect(report.outcome).toBe('win');
    expect(report.winners.map((p) => p.name)).toEqual(['Alice']);
    expect(report.margin).toBe(70);
    expect(report.players.map((p) => [p.name, p.rank, p.score, p.finished])).toEqual([
      ['Alice', 1, 93, true],
      ['Bob', 2, 23, true],
      ['Cara', null, 66, false],
    ]);
    expect(report.players[0]).toMatchObject({ isLocal: true, wentOut: true, adjustment: 5, avatarId: 3 });
    expect(report.players[1]).toMatchObject({ isLocal: false, adjustment: -5 });
  });

  it('works out each player’s highlights from the turn log', () => {
    const [alice, bob, cara] = buildReport(wonGame()).players;
    expect(alice).toMatchObject({
      turns: 3,
      plays: 3,
      passes: 0,
      exchanges: 0,
      words: 4,
      tiles: 8,
      bingos: 0,
      premiums: { DL: 1, TL: 1, DW: 1, TW: 0 },
      bestPlay: { turnNumber: 1, total: 48, words: ['QUART'], bingo: false },
      bestWord: { text: 'QUART', score: 48 },
      longestWord: { text: 'QUART' },
      averagePlay: 29.3,
    });
    expect(bob).toMatchObject({ plays: 2, exchanges: 1, words: 3, longestWord: { text: 'EXCITING', score: 20 }, averagePlay: 14 });
    expect(cara).toMatchObject({ plays: 1, passes: 1, bingos: 1, blanks: 1, bestPlay: { total: 66, bingo: true } });
  });

  it('sums up the game and its notable moments', () => {
    const report = buildReport(wonGame());
    expect(report).toMatchObject({
      turns: 8,
      rounds: 3,
      durationMs: 42 * 60_000 + 10_000,
      words: 8,
      points: 182,
      tiles: 20,
      bingos: 1,
      leadChanges: 2,
      biggestPlay: { seatId: '3', total: 66, turnNumber: 3, words: ['RETAINS'] },
      bestWord: { seatId: '3', text: 'RETAINS', score: 66 },
      longestWord: { seatId: '2', text: 'EXCITING' },
      settled: true,
      lastTurn: 8,
    });
  });

  it('charts every player’s score by turn, closing with the settled racks', () => {
    const series = Object.fromEntries(buildReport(wonGame()).series.map((s) => [s.seatId, s.points.map((p) => [p.turn, p.score])]));
    expect(series).toEqual({
      1: [[0, 0], [1, 48], [4, 70], [7, 88], [8, 88], [9, 93]],
      2: [[0, 0], [2, 8], [5, 8], [8, 28], [9, 23]],
      3: [[0, 0], [3, 66], [6, 66]],
    });
  });

  it('calls a shared top score a tie and ranks like a leaderboard', () => {
    const base = wonGame();
    const report = buildReport({
      ...base,
      endReason: 'scoreless_turns',
      wentOutSeatId: null,
      finalAdjustments: { 1: 0, 2: 0, 3: 0 },
      recap: { ...base.recap!, history: [], finalScores: { 1: 50, 2: 50, 3: 30 } },
    });
    expect(report.outcome).toBe('tie');
    expect(report.winners.map((p) => p.seatId)).toEqual(['1', '2']);
    expect(report.players.map((p) => p.rank)).toEqual([1, 1, 3]);
    expect(report.margin).toBeNull();
    expect(report.settled).toBe(false);
  });

  it('crowns no one when the game was abandoned', () => {
    const base = wonGame();
    const report = buildReport({ ...base, endReason: 'abandoned', finalAdjustments: null, recap: { ...base.recap!, finalScores: { 1: 88 } } });
    expect(report.outcome).toBe('abandoned');
    expect(report.winners).toEqual([]);
    expect(report.players.filter((p) => p.finished).map((p) => [p.name, p.rank, p.score])).toEqual([['Alice', 1, 88]]);
    expect(report.players.filter((p) => !p.finished).map((p) => p.name)).toEqual(['Bob', 'Cara']);
  });

  it('still ranks the table for a game that ended before turn history was kept', () => {
    const report = buildReport(
      snapshot({
        status: 'ended',
        endReason: 'scoreless_turns',
        seats: [seat('1', { displayName: 'Alice', score: 12 }), seat('2', { displayName: 'Bob', score: 30 })],
      }),
    );
    expect(report.outcome).toBe('win');
    expect(report.winners.map((p) => p.name)).toEqual(['Bob']);
    expect(report.turns).toBe(0);
    expect(report.durationMs).toBeNull();
    expect(report.series.every((s) => s.points.length === 1 || s.points.length === 2)).toBe(true);
  });

  it('keeps the name a seat played under when someone else sits there afterwards', () => {
    const base = wonGame();
    const report = buildReport({
      ...base,
      seats: base.seats.map((s) => (s.seatId === '2' ? { ...s, displayName: 'Newcomer', isLocal: false } : s)),
    });
    expect(report.players[1]).toMatchObject({ name: 'Bob', isLocal: false });
  });
});
