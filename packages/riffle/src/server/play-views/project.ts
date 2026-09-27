import type { MatchStore } from '../../match-store/index.js';
import type { SeatMatchView } from '../../match-store/types.js';
import type { SeatTable, SeatViewResponse } from '../table/dto.js';

export function projectSeatViewResponse(
  seatId: string,
  seatView: SeatMatchView,
): SeatViewResponse {
  return {
    seatId,
    view: seatView.hole ? { hole: [seatView.hole[0], seatView.hole[1]] } : null,
  };
}

export function projectSeatTable(
  matchStore: MatchStore,
  matchId: string,
  seatView: SeatMatchView,
): SeatTable {
  const legal = matchStore.getSeatLegalActions(matchId, seatView.seatId);

  return {
    matchId: seatView.matchId,
    seatId: seatView.seatId,
    hole: seatView.hole,
    currentSeat: seatView.currentSeat,
    seats: seatView.seats.map((seat) => ({
      seatId: seat.seatId,
      stack: seat.stack,
    })),
    ...(seatView.pot !== undefined ? { pot: seatView.pot } : {}),
    ...(seatView.board !== undefined && seatView.board.length >= 3
      ? { board: seatView.board }
      : {}),
    ...(seatView.completeReason !== undefined ? { completeReason: seatView.completeReason } : {}),
    ...(seatView.winners !== undefined ? { winners: seatView.winners } : {}),
    ...(seatView.shownHoles !== undefined ? { shownHoles: seatView.shownHoles } : {}),
    ...(legal !== undefined ? { legalActions: legal } : {}),
  };
}
