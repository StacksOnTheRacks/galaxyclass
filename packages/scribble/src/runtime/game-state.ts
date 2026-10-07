import type { GameState } from '../rules/game.js';
import type { SeatRecord, StoredGame, TableRecord } from './types.js';

/** Joins the table's shared state with the seats' racks and scores into the rules engine's view. */
export function toGameState(table: TableRecord, seats: ReadonlyArray<SeatRecord>): GameState {
  const players: GameState['players'] = {};
  for (const seatId of table.game.turnOrder) {
    const seat = seats.find((s) => s.seatId === seatId);
    if (seat) {
      players[seatId] = { rack: seat.rack, score: seat.score };
    }
  }
  return { ...table.game, history: table.game.history ?? [], finalScores: table.game.finalScores ?? null, players };
}

/** Splits a rules-engine state back into the table record and the seats whose rack or score changed. */
export function fromGameState(
  table: TableRecord,
  seats: ReadonlyArray<SeatRecord>,
  state: GameState,
): { table: TableRecord; changedSeats: SeatRecord[] } {
  const { players, ...shared } = state;
  const game: StoredGame = shared;
  const changedSeats: SeatRecord[] = [];
  for (const seat of seats) {
    const player = players[seat.seatId];
    if (!player) {
      continue;
    }
    if (player.score !== seat.score || JSON.stringify(player.rack) !== JSON.stringify(seat.rack)) {
      changedSeats.push({ ...seat, rack: player.rack, score: player.score });
    }
  }
  return { table: { ...table, game }, changedSeats };
}
