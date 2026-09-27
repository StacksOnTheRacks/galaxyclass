import type { TurnurClient } from '@turnur/sdk';
import type { Card } from '../../rules/types.js';
import { requireAuthenticatedTurnurClient } from '../turnur/session.js';
import type { PublicTable } from './dto.js';
import {
  actionsAfterHandOpen,
  findLatestHandOpen,
  reconstructHand,
} from '../hands/reconstruct.js';
import type { MoveLogItem } from '../hands/move-types.js';
import { findLatestStreetBoard, syntheticHolesForSeats } from '../hands/move-types.js';
import { filterPublicRosterSeats } from '../hands/shoe.js';

export interface PublicTableInput {
  matchId: string;
}

export interface PublicTableDeps {
  getClient?: () => Promise<TurnurClient>;
}

function projectBoard(
  actions: MoveLogItem[],
  stateBoard: Card[],
): Card[] | undefined {
  const fromLog = findLatestStreetBoard(actions);
  if (fromLog && fromLog.length > 0) {
    return fromLog;
  }
  if (stateBoard.length >= 3) {
    return stateBoard;
  }
  return undefined;
}

export async function getPublicTable(
  input: PublicTableInput,
  deps: PublicTableDeps = {},
): Promise<PublicTable> {
  const getClient = deps.getClient ?? requireAuthenticatedTurnurClient;
  const client = await getClient();
  const result = await client.match.seat.list(input.matchId);
  const filteredRoster = filterPublicRosterSeats(result.seats, null);

  let movesList;
  try {
    movesList = await client.match.moves.list(input.matchId);
  } catch {
    return {
      matchId: input.matchId,
      seats: filteredRoster.map((seat) => ({ seatId: seat.seatId })),
      currentSeat: result.currentSeat,
    };
  }

  const items = movesList.items as MoveLogItem[];
  const handOpen = findLatestHandOpen(items);
  if (!handOpen) {
    const rosterBeforeOpen = filterPublicRosterSeats(result.seats, null);
    return {
      matchId: input.matchId,
      seats: rosterBeforeOpen.map((seat) => ({ seatId: seat.seatId })),
      currentSeat: result.currentSeat,
    };
  }

  const actions = actionsAfterHandOpen(items);
  const seatIds = handOpen.seats.map((seat) => seat.seatId);
  const holesBySeat = syntheticHolesForSeats(seatIds);
  const reconstructed = reconstructHand({
    handOpen,
    actions,
    holesBySeat,
    shoe: null,
  });

  if (!reconstructed.ok) {
    return {
      matchId: input.matchId,
      seats: handOpen.seats.map((seat) => ({ seatId: seat.seatId })),
      currentSeat: result.currentSeat,
    };
  }

  const state = reconstructed.value;
  const board = projectBoard(actions, state.board);
  const table: PublicTable = {
    matchId: input.matchId,
    seats: state.seats.map((seat) => ({ seatId: seat.seatId, stack: seat.stack })),
    currentSeat: state.currentSeatId,
    pot: state.pot,
  };
  if (board) {
    table.board = board;
  }
  if (state.phase === 'complete') {
    if (state.completeReason) {
      table.completeReason = state.completeReason;
    }
    if (state.winners) {
      table.winners = state.winners.map((winner) => ({
        seatId: winner.seatId,
        amount: winner.amount,
      }));
    }
    if (state.shownHolesFacts && state.shownHolesFacts.length > 0) {
      table.shownHoles = state.shownHolesFacts.map((shown) => ({
        seatId: shown.seatId,
        hole: [shown.hole[0], shown.hole[1]],
      }));
    }
  }
  return table;
}

export async function loadSeatHole(
  client: TurnurClient,
  matchId: string,
  seatId: string,
): Promise<[Card, Card] | null> {
  const viewResult = await client.match.view.get(matchId, seatId);
  if (viewResult.view === null || viewResult.view === undefined) {
    return null;
  }
  const { parseHoleView } = await import('./dto.js');
  const parsed = parseHoleView(viewResult.view);
  return parsed?.hole ?? null;
}
