import type { GameRecap, RosterEntry, SeatRecord, StoredGame, TableRecord } from './types.js';

/**
 * Carries the report bookkeeping across a commit: when the game started and ended, and who played
 * from each seat. Runs on every commit so no action has to remember it.
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

  const roster: Record<string, RosterEntry> = { ...prior.roster, ...(fresh ? {} : game.roster) };
  if (game.status === 'playing' || before.game.status === 'playing') {
    for (const seat of seatsAfter) {
      if (game.turnOrder.includes(seat.seatId)) {
        roster[seat.seatId] = { displayName: seat.displayName, avatarId: seat.avatarId };
      }
    }
  }

  const startedAt = fresh ? at : (game.startedAt ?? prior.startedAt);
  let endedAt = fresh ? undefined : (game.endedAt ?? prior.endedAt);
  if (game.status === 'ended' && before.game.status === 'playing' && !endedAt) {
    endedAt = at;
  }
  return {
    ...after,
    game: {
      ...game,
      roster,
      ...(startedAt ? { startedAt } : {}),
      ...(endedAt ? { endedAt } : {}),
    },
  };
}

export function recapOf(game: StoredGame): GameRecap {
  return {
    history: game.history ?? [],
    finalScores: game.finalScores ?? null,
    roster: game.roster ?? {},
    startedAt: game.startedAt ?? null,
    endedAt: game.endedAt ?? null,
  };
}
