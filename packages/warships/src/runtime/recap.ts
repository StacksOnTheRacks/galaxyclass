import type { GameRecap, RosterEntry } from '../protocol.js';
import type { Fleet, SeatId } from '../rules/types.js';
import type { SeatRecord, StoredGame, TableRecord } from './types.js';

const IN_PLAY = new Set(['placing', 'battle']);

/**
 * Carries the report bookkeeping across a commit: when battle started and the game ended, and who
 * played from each seat. Runs on every commit so no action has to remember it.
 */
export function stampGame(
  before: TableRecord,
  after: TableRecord,
  seatsAfter: ReadonlyArray<SeatRecord>,
  now: number,
): TableRecord {
  const game = after.game;
  if (game.status === 'waiting') {
    return after;
  }
  const at = new Date(now).toISOString();
  const fresh = after.gameNumber !== before.gameNumber;
  const prior: Partial<StoredGame> = fresh ? {} : before.game;

  const roster: Partial<Record<SeatId, RosterEntry>> = { ...prior.roster, ...(fresh ? {} : game.roster) };
  if (IN_PLAY.has(game.status) || (!fresh && IN_PLAY.has(before.game.status))) {
    for (const seat of seatsAfter) {
      if (game.players.includes(seat.seatId)) {
        roster[seat.seatId] = { displayName: seat.displayName, avatarId: seat.avatarId };
      }
    }
  }

  let startedAt = fresh ? undefined : (game.startedAt ?? prior.startedAt);
  if (game.status === 'battle' && !startedAt) {
    startedAt = at;
  }
  let endedAt = fresh ? undefined : (game.endedAt ?? prior.endedAt);
  if (game.status === 'finished' && before.game.status !== 'finished' && !endedAt) {
    endedAt = at;
  }
  const { startedAt: _s, endedAt: _e, ...rest } = game;
  return {
    ...after,
    game: {
      ...rest,
      roster,
      ...(startedAt ? { startedAt } : {}),
      ...(endedAt ? { endedAt } : {}),
    },
  };
}

/** The after-action report. Only built once the game is finished, when both fleets are public. */
export function recapOf(game: StoredGame): GameRecap {
  const fleets: Partial<Record<SeatId, Fleet>> = {};
  for (const seatId of game.players) {
    const fleet = game.boards[seatId]?.fleet;
    if (fleet) {
      fleets[seatId] = fleet;
    }
  }
  return {
    shots: game.history ?? [],
    fleets,
    roster: game.roster ?? {},
    startedAt: game.startedAt ?? null,
    endedAt: game.endedAt ?? null,
  };
}
