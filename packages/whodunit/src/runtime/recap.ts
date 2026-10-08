import type { GameRecap, RosterEntry } from '../protocol.js';
import type { CardId, SeatId } from '../rules/types.js';
import { redactEvent } from './snapshot.js';
import type { SeatRecord, StoredGame, TableRecord } from './types.js';

/**
 * Carries the recap bookkeeping across a commit: when the case started and ended, and who played
 * from each seat (with their suspect). Runs on every commit so no action has to remember it.
 */
export function stampGame(
  before: TableRecord,
  after: TableRecord,
  seatsAfter: ReadonlyArray<SeatRecord>,
  now: number,
): TableRecord {
  const game = after.game;
  if (game.status === 'setup') {
    return after;
  }
  const at = new Date(now).toISOString();
  const fresh = after.gameNumber !== before.gameNumber;
  const prior: Partial<StoredGame> = fresh ? {} : before.game;

  const roster: Partial<Record<SeatId, RosterEntry>> = { ...prior.roster, ...(fresh ? {} : game.roster) };
  if (game.status === 'playing' || (!fresh && before.game.status === 'playing')) {
    for (const seat of seatsAfter) {
      if (game.players.includes(seat.seatId)) {
        roster[seat.seatId] = {
          displayName: seat.displayName,
          avatarId: seat.avatarId,
          suspect: game.picks[seat.seatId]?.suspect ?? null,
        };
      }
    }
  }

  let startedAt = fresh ? undefined : (game.startedAt ?? prior.startedAt);
  if (game.status === 'playing' && !startedAt) {
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

/**
 * The case closed. Only built once finished, when the case file and every hand are public; the
 * cards shown during the case stay private to the two detectives who saw each one.
 */
export function recapOf(game: StoredGame, viewer: SeatId | null): GameRecap {
  const hands: Partial<Record<SeatId, CardId[]>> = {};
  for (const seatId of game.players) {
    hands[seatId] = [...(game.hands[seatId] ?? [])];
  }
  return {
    solution: { ...game.solution! },
    hands,
    roster: game.roster ?? {},
    events: game.log.map((event) => redactEvent(event, viewer)),
    startedAt: game.startedAt ?? null,
    endedAt: game.endedAt ?? null,
  };
}
