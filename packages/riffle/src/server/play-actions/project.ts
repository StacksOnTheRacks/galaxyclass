import type { ApplyPlayerActionResult } from '../../match-store/store.js';
import type { SeatTable } from '../table/dto.js';

export function projectPlayActionSeatTable(
  matchId: string,
  applied: ApplyPlayerActionResult,
): SeatTable {
  const table: SeatTable = {
    matchId,
    seatId: applied.seatId,
    hole: applied.hole,
    currentSeat: applied.currentSeat,
    seats: applied.seats,
    ...(applied.pot !== undefined ? { pot: applied.pot } : {}),
    ...(applied.board !== undefined ? { board: applied.board } : {}),
    ...(applied.legalActions !== undefined ? { legalActions: applied.legalActions } : {}),
  };

  return table;
}
