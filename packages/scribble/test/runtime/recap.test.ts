import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recapOf, stampGame } from '../../src/runtime/recap.js';
import { newTableRecord, parseTableItem } from '../../src/runtime/table-record.js';
import type { SeatRecord, TableRecord } from '../../src/runtime/types.js';
import { signAccessToken } from '../support/cognito-tokens.js';
import { Harness, TABLE_ID } from '../support/runtime-harness.js';

const T0 = Date.parse('2026-10-04T12:00:00.000Z');

function seatRecord(seatId: string, displayName: string, avatarId = 1): SeatRecord {
  return { seatId, displayName, avatarId, seatTokenHash: 'x', connectionId: `c${seatId}`, rack: [], score: 0 };
}

function table(game: Partial<TableRecord['game']>, gameNumber = 1): TableRecord {
  const base = newTableRecord({ tableId: 't1', createdAt: '2026-10-04T00:00:00.000Z' });
  return { ...base, gameNumber, game: { ...base.game, ...game } };
}

describe('stamping the report bookkeeping', () => {
  it('starts a fresh roster and clock when a new game is dealt', () => {
    const before = table({ status: 'ended', roster: { 1: { displayName: 'Old', avatarId: 2 } }, startedAt: 'x', endedAt: 'y' }, 1);
    const after = table({ status: 'playing', turnOrder: ['1', '2'] }, 2);
    const stamped = stampGame(before, after, [seatRecord('1', 'WordSmith', 12), seatRecord('2', 'InkBlot', 30)], T0);
    expect(stamped.game.roster).toEqual({ 1: { displayName: 'WordSmith', avatarId: 12 }, 2: { displayName: 'InkBlot', avatarId: 30 } });
    expect(stamped.game.startedAt).toBe('2026-10-04T12:00:00.000Z');
    expect(stamped.game.endedAt).toBeUndefined();
  });

  it('stamps the end once and keeps a departed player in the roster', () => {
    const playing = table({ status: 'playing', turnOrder: ['1', '2'], startedAt: '2026-10-04T11:00:00.000Z', roster: { 2: { displayName: 'InkBlot', avatarId: 30 } } });
    const ended = { ...playing, game: { ...playing.game, status: 'ended' as const, turnOrder: ['1'] } };
    const stamped = stampGame(playing, ended, [seatRecord('1', 'WordSmith')], T0);
    expect(stamped.game).toMatchObject({
      startedAt: '2026-10-04T11:00:00.000Z',
      endedAt: '2026-10-04T12:00:00.000Z',
      roster: { 1: { displayName: 'WordSmith' }, 2: { displayName: 'InkBlot' } },
    });
    const later = stampGame(stamped, { ...stamped, game: { ...stamped.game, turnOrder: [] } }, [], T0 + 60_000);
    expect(later.game.endedAt).toBe('2026-10-04T12:00:00.000Z');
    expect(later.game.roster).toEqual(stamped.game.roster);
  });

  it('leaves a table with no game untouched', () => {
    const waiting = table({}, 0);
    expect(stampGame(waiting, waiting, [seatRecord('1', 'WordSmith')], T0)).toBe(waiting);
  });

  it('round-trips the history through a stored item and reads older items without it', () => {
    const stored = table({
      status: 'ended',
      history: [{ turnNumber: 1, seatId: '1', kind: 'pass', words: [], tiles: 0, blanks: 0, premiums: [], total: 0, bingo: false, exchanged: 0, score: 0 }],
      finalScores: { 1: 0 },
      roster: { 1: { displayName: 'WordSmith', avatarId: 12 } },
      startedAt: '2026-10-04T11:00:00.000Z',
      endedAt: '2026-10-04T12:00:00.000Z',
    });
    expect(parseTableItem({ ...stored })).toEqual(stored);
    const legacy = parseTableItem({ tableId: 't2', game: { status: 'ended' } });
    expect(recapOf(legacy.game)).toEqual({ history: [], finalScores: null, roster: {}, startedAt: null, endedAt: null });
  });
});

describe('the game-over payload', () => {
  let h: Harness;

  beforeEach(async () => {
    h = new Harness();
    await h.seed();
  });
  afterEach(() => vi.restoreAllMocks());

  async function member(connectionId: string, accessToken: string): Promise<string> {
    await h.connect(connectionId);
    await h.send(connectionId, { action: 'join_table', tableId: TABLE_ID, accessToken });
    await h.send(connectionId, { action: 'sit', accessToken });
    return h.last(connectionId, 'sat').seatToken;
  }

  it('is sent only once the game ends, with the turn log, names, and times', async () => {
    const tokenA = await member('a', signAccessToken());
    const tokenB = await member('b', signAccessToken({ sub: 'sub-ink-blot', username: 'sub-ink-blot' }));
    await h.send('a', { action: 'start_game', seatToken: tokenA });
    h.rigRack('1', 'QZ');
    h.rigRack('2', 'AE');
    h.rigGame((t) => {
      t.game.currentSeatId = '1';
    });
    expect(h.snapshot('a').recap).toBeUndefined();

    for (let i = 0; i < 6; i++) {
      h.advance(60_000);
      const [conn, token] = i % 2 === 0 ? ['a', tokenA] : ['b', tokenB];
      await h.send(conn, { action: 'pass', seatToken: token });
      if (i < 5) {
        expect(h.snapshot('a').recap).toBeUndefined();
      }
    }

    const recap = h.snapshot('b').recap!;
    expect(recap.history.map((turn) => [turn.turnNumber, turn.seatId, turn.kind])).toEqual([
      [1, '1', 'pass'],
      [2, '2', 'pass'],
      [3, '1', 'pass'],
      [4, '2', 'pass'],
      [5, '1', 'pass'],
      [6, '2', 'pass'],
    ]);
    expect(recap.finalScores).toEqual({ 1: -20, 2: -2 });
    expect(recap.roster).toEqual({ 1: { displayName: 'WordSmith', avatarId: 12 }, 2: { displayName: 'InkBlot', avatarId: 30 } });
    expect(recap.startedAt).toBe('2026-10-04T12:00:00.000Z');
    expect(recap.endedAt).toBe('2026-10-04T12:06:00.000Z');
    expect(JSON.stringify(recap)).not.toMatch(/seatTokenHash|playerSub|sub-|rig\d-/);

    await h.send('b', { action: 'leave', seatToken: tokenB });
    const after = h.snapshot('a').recap!;
    expect(after.finalScores).toEqual({ 1: -20, 2: -2 });
    expect(after.roster['2']).toEqual({ displayName: 'InkBlot', avatarId: 30 });
    expect(h.store.tables.get(TABLE_ID)!.game.endedAt).toBe('2026-10-04T12:06:00.000Z');
  });
});
