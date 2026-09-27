import type { TurnurClient } from '@turnur/sdk';
import { legalActions } from '../../rules/index.js';
import { requireAuthenticatedTurnurClient } from '../turnur/session.js';
import type { Card, SeatTable } from './dto.js';
import { parseHoleView } from './dto.js';
import type { MoveLogItem } from '../hands/move-types.js';
import {
  actionsAfterHandOpen,
  findLatestHandOpen,
  reconstructHand,
} from '../hands/reconstruct.js';
import { findLatestStreetBoard, syntheticHolesForSeats } from '../hands/move-types.js';
import { loadShoe, resolveShoeSeatId, filterPublicRosterSeats } from '../hands/shoe.js';

export interface SeatTableInput {
  matchId: string;
  seatId: string;
}

export interface SeatTableDeps {
  getClient?: () => Promise<TurnurClient>;
}

export class ShoeSeatNotFoundError extends Error {
  constructor() {
    super('seat_not_found');
    this.name = 'ShoeSeatNotFoundError';
  }
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

export async function getSeatTable(
  input: SeatTableInput,
  deps: SeatTableDeps = {},
): Promise<SeatTable> {
  const getClient = deps.getClient ?? requireAuthenticatedTurnurClient;
  const client = await getClient();

  const roster = await client.match.seat.list(input.matchId);
  const movesList = await client.match.moves.list(input.matchId);
  const items = movesList.items as MoveLogItem[];
  const handOpen = findLatestHandOpen(items);

  if (handOpen) {
    const shoeResolve = resolveShoeSeatId(
      handOpen.shoeSeatId,
      roster.seats.map((seat) => seat.seatId),
      handOpen.seats.map((seat) => seat.seatId),
    );
    if (shoeResolve.ok && shoeResolve.shoeSeatId === input.seatId) {
      throw new ShoeSeatNotFoundError();
    }
  }

  if (!handOpen) {
    const rosterBeforeOpen = filterPublicRosterSeats(roster.seats, null);
    const viewResult = await client.match.view.get(input.matchId, input.seatId);
    let hole: SeatTable['hole'] = null;
    if (viewResult.view !== null && viewResult.view !== undefined) {
      const parsed = parseHoleView(viewResult.view);
      hole = parsed?.hole ?? null;
    }
    return {
      matchId: input.matchId,
      seats: rosterBeforeOpen.map((seat) => ({ seatId: seat.seatId })),
      currentSeat: roster.currentSeat,
      seatId: input.seatId,
      hole,
    };
  }

  const seatIds = handOpen.seats.map((seat) => seat.seatId);
  const holesBySeat = syntheticHolesForSeats(seatIds);

  const viewResult = await client.match.view.get(input.matchId, input.seatId);
  if (viewResult.view !== null && viewResult.view !== undefined) {
    const parsed = parseHoleView(viewResult.view);
    if (parsed) {
      holesBySeat.set(input.seatId, parsed.hole);
    }
  }

  const actions = actionsAfterHandOpen(items);
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
      currentSeat: roster.currentSeat,
      seatId: input.seatId,
      hole: holesBySeat.get(input.seatId) ?? null,
    };
  }

  const state = reconstructed.value;
  const ownHole = holesBySeat.get(input.seatId) ?? null;
  const board = projectBoard(actions, state.board);
  const table: SeatTable = {
    matchId: input.matchId,
    seats: state.seats.map((seat) => ({ seatId: seat.seatId, stack: seat.stack })),
    currentSeat: state.currentSeatId,
    pot: state.pot,
    seatId: input.seatId,
    hole: ownHole,
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

  if (state.phase === 'betting' && state.currentSeatId === input.seatId) {
    table.legalActions = legalActions(state, input.seatId);
  }

  return table;
}

export async function loadShoeForHand(
  client: TurnurClient,
  matchId: string,
  handOpen: NonNullable<ReturnType<typeof findLatestHandOpen>>,
  rosterSeatIds: string[],
): Promise<
  | { ok: true; value: import('../hands/shoe.js').ShoeView }
  | { ok: false; error: 'invalid_shoe' | 'shoe_missing' | 'shoe_ambiguous' }
> {
  const shoeResolve = resolveShoeSeatId(
    handOpen.shoeSeatId,
    rosterSeatIds,
    handOpen.seats.map((seat) => seat.seatId),
  );
  if (!shoeResolve.ok) {
    return { ok: false, error: shoeResolve.error };
  }
  return loadShoe(client, matchId, shoeResolve.shoeSeatId);
}

export { InvalidViewError } from './view.js';
