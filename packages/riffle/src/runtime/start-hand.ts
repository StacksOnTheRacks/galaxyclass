import { dealHand } from '../rules/deal.js';
import { createSeededRng } from '../rules/rng.js';
import {
  applyHandStateToSeats,
  applyHandStateToTable,
  clearSeatHand,
  isBetweenHands,
  isSeatAway,
} from './hand-state.js';
import { findSeatByToken } from './sit.js';
import type { MatchStore } from './store.js';
import type { ClientMessage, ConnectionRecord, SeatRecord, TableRecord } from './types.js';

export type StartHandErrorCode =
  | 'invalid_seat_token'
  | 'not_seated'
  | 'insufficient_players'
  | 'hand_in_progress'
  | 'client_supplied_state'
  | 'version_conflict';

export interface StartHandContext {
  store: MatchStore;
  connection: ConnectionRecord;
  table: TableRecord;
  seats: SeatRecord[];
  message: ClientMessage;
  rngSeed?: number;
}

export interface StartHandSuccess {
  ok: true;
  table: TableRecord;
  seats: SeatRecord[];
}

export interface StartHandFailure {
  ok: false;
  code: StartHandErrorCode;
}

export type StartHandResult = StartHandSuccess | StartHandFailure;

const ALL_SEAT_IDS = ['1', '2', '3', '4', '5', '6', '7', '8'];

export function chooseButtonSeatId(seats: SeatRecord[], previousButton?: string): string {
  const seatedIds = seats.map((seat) => seat.seatId).sort((a, b) => Number(a) - Number(b));
  if (seatedIds.length === 0) {
    throw new Error('chooseButtonSeatId requires seated players');
  }

  if (!previousButton) {
    return seatedIds[0]!;
  }

  const seated = new Set(seatedIds);
  const startIndex = ALL_SEAT_IDS.indexOf(previousButton);
  for (let offset = 1; offset <= ALL_SEAT_IDS.length; offset += 1) {
    const candidate = ALL_SEAT_IDS[(startIndex + offset) % ALL_SEAT_IDS.length]!;
    if (seated.has(candidate)) {
      return candidate;
    }
  }

  return seatedIds[0]!;
}

export async function handleStartHand(ctx: StartHandContext): Promise<StartHandResult> {
  const { connection, table, seats, message } = ctx;

  if (!isBetweenHands(table)) {
    return { ok: false, code: 'hand_in_progress' };
  }

  if (!message.seatToken) {
    return { ok: false, code: 'invalid_seat_token' };
  }

  const callerSeat = findSeatByToken(seats, message.seatToken);
  if (!callerSeat || callerSeat.seatId !== connection.seatId) {
    return { ok: false, code: 'not_seated' };
  }

  return dealNextHand(ctx.store, table, seats, ctx.rngSeed);
}

/** Seats that would be dealt into the next hand. */
export function dealableSeats(seats: SeatRecord[]): SeatRecord[] {
  // Away (disconnected), departing, and busted seats sit out rather than stall the hand.
  return seats.filter((seat) => !isSeatAway(seat) && !seat.leaveAfterHand && seat.stack > 0);
}

/** Server-owned deal: no caller seat required. The table must be between hands. */
export async function dealNextHand(
  store: MatchStore,
  table: TableRecord,
  seats: SeatRecord[],
  rngSeed?: number,
): Promise<StartHandResult> {
  if (!isBetweenHands(table)) {
    return { ok: false, code: 'hand_in_progress' };
  }

  const dealtIn = dealableSeats(seats);
  if (dealtIn.length < 2) {
    return { ok: false, code: 'insufficient_players' };
  }

  const buttonSeatId = chooseButtonSeatId(
    dealtIn,
    table.handNumber > 0 ? table.buttonSeatId : undefined,
  );

  const dealResult = dealHand({
    seats: dealtIn.map((seat) => ({ seatId: seat.seatId, stack: seat.stack })),
    buttonSeatId,
    blinds: table.blinds,
    rng: createSeededRng(rngSeed ?? Date.now()),
  });

  if (!dealResult.ok) {
    return { ok: false, code: 'insufficient_players' };
  }

  const handState = dealResult.value;
  const nextHandNumber = table.handNumber + 1;
  const updatedTable = applyHandStateToTable(
    {
      ...table,
      handNumber: nextHandNumber,
      buttonSeatId,
      streetActions: [],
    },
    handState,
    table.version + 1,
  );

  const updatedSeats = applyHandStateToSeats(handState, seats.map(clearSeatHand));
  const persisted = await store.updateTableWithVersion(
    table.tableId,
    table.version,
    updatedTable,
    updatedSeats,
  );

  if (!persisted) {
    return { ok: false, code: 'version_conflict' };
  }

  return {
    ok: true,
    table: updatedTable,
    seats: updatedSeats,
  };
}
