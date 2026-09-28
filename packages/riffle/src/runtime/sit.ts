import { validateDisplayName } from '../shared/display-name.js';
import { foldAwayActors } from './act.js';
import { isBetweenHands, isSeatAway } from './hand-state.js';
import { hashSeatToken, mintSeatToken, verifySeatToken } from './seat-token.js';
import type { MatchStore } from './store.js';
import type { ClientMessage, ConnectionRecord, SeatRecord, TableRecord } from './types.js';

const VALID_SEAT_IDS = new Set(['1', '2', '3', '4', '5', '6', '7', '8']);

export type SitErrorCode =
  | 'not_table_member'
  | 'hand_in_progress'
  | 'seat_occupied'
  | 'already_seated'
  | 'table_full'
  | 'empty_display_name'
  | 'invalid_display_name'
  | 'invalid_seat'
  | 'client_supplied_state'
  | 'invalid_seat_token'
  | 'not_seated'
  | 'version_conflict';

export interface SitContext {
  store: MatchStore;
  connection: ConnectionRecord;
  table: TableRecord;
  seats: SeatRecord[];
  message: ClientMessage;
  now?: string;
}

export interface SitSuccess {
  ok: true;
  seatToken: string;
  seatId: string;
  table: TableRecord;
  seats: SeatRecord[];
}

export interface SitFailure {
  ok: false;
  code: SitErrorCode;
}

export type SitResult = SitSuccess | SitFailure;

function isValidSeatId(seatId: string | undefined): seatId is string {
  return typeof seatId === 'string' && VALID_SEAT_IDS.has(seatId);
}

export async function handleSit(ctx: SitContext): Promise<SitResult> {
  const { connection, table, seats, message } = ctx;

  if (!connection.tableId || connection.tableId !== table.tableId) {
    return { ok: false, code: 'not_table_member' };
  }

  if (!isValidSeatId(message.seatId)) {
    return { ok: false, code: 'invalid_seat' };
  }

  if (!(message.displayName ?? '').trim()) {
    return { ok: false, code: 'empty_display_name' };
  }
  const validatedName = validateDisplayName(message.displayName);
  if (!validatedName.ok) {
    return { ok: false, code: 'invalid_display_name' };
  }
  const displayName = validatedName.value;

  if (connection.seatId) {
    return { ok: false, code: 'already_seated' };
  }

  // An away seat can be taken over once it is out of the live hand; its reclaim token stops working.
  // Empty seats can be taken mid-hand: the new player has no cards and joins the next deal.
  const existingSeat = seats.find((seat) => seat.seatId === message.seatId);
  const replacesAwaySeat =
    existingSeat !== undefined &&
    isSeatAway(existingSeat) &&
    (isBetweenHands(table) || !existingSeat.hole);
  if (seats.length >= table.maxSeats && !replacesAwaySeat) {
    return { ok: false, code: 'table_full' };
  }
  if (existingSeat && !replacesAwaySeat) {
    return { ok: false, code: 'seat_occupied' };
  }
  const otherSeats = seats.filter((seat) => seat.seatId !== message.seatId);

  const seatToken = mintSeatToken();
  const seatTokenHash = hashSeatToken(seatToken);
  const newSeat: SeatRecord = {
    seatId: message.seatId,
    displayName,
    stack: table.defaultStack,
    seatTokenHash,
    connectionId: connection.connectionId,
  };

  await ctx.store.putSeat(table.tableId, newSeat);
  await ctx.store.bindConnectionToSeat(connection.connectionId, message.seatId);

  // The seat is already stored; a concurrent betting action only moved the version on.
  let updatedTable = await ctx.store.incrementTableVersion(table.tableId, table.version);
  for (let attempt = 0; !updatedTable && attempt < 2; attempt += 1) {
    const fresh = await ctx.store.getTable(table.tableId);
    if (!fresh) {
      break;
    }
    updatedTable = await ctx.store.incrementTableVersion(table.tableId, fresh.version);
  }
  if (!updatedTable) {
    return { ok: false, code: 'version_conflict' };
  }

  const currentSeats =
    updatedTable.version === table.version + 1
      ? [...otherSeats, newSeat].sort((a, b) => Number(a.seatId) - Number(b.seatId))
      : await ctx.store.listSeats(table.tableId);

  return {
    ok: true,
    seatToken,
    seatId: message.seatId,
    table: updatedTable,
    seats: currentSeats,
  };
}

export async function handleResumeSeat(ctx: SitContext): Promise<SitResult> {
  const { connection, table, seats, message } = ctx;

  if (!connection.tableId || connection.tableId !== table.tableId) {
    return { ok: false, code: 'not_table_member' };
  }

  if (!message.seatToken) {
    return { ok: false, code: 'invalid_seat_token' };
  }

  const seat = findSeatByToken(seats, message.seatToken);
  if (!seat || seat.leaveAfterHand) {
    return { ok: false, code: 'invalid_seat_token' };
  }

  if (connection.seatId && connection.seatId !== seat.seatId) {
    return { ok: false, code: 'already_seated' };
  }

  const { awaySince: _awaySince, ...present } = seat;
  const resumedSeat: SeatRecord = { ...present, connectionId: connection.connectionId };
  await ctx.store.bindConnectionToSeat(connection.connectionId, seat.seatId);

  const updatedTable = await ctx.store.updateTableWithVersion(
    table.tableId,
    table.version,
    { ...table, version: table.version + 1 },
    [resumedSeat],
  );
  if (!updatedTable) {
    return { ok: false, code: 'version_conflict' };
  }

  return {
    ok: true,
    seatToken: message.seatToken,
    seatId: seat.seatId,
    table: updatedTable,
    seats: seats.map((row) => (row.seatId === seat.seatId ? resumedSeat : row)),
  };
}

export async function handleLeave(ctx: SitContext): Promise<SitResult> {
  const { connection, table, seats, message } = ctx;

  if (!message.seatToken) {
    return { ok: false, code: 'invalid_seat_token' };
  }

  const seat = seats.find((row) => row.seatId === connection.seatId);
  if (!seat || !connection.seatId) {
    return { ok: false, code: 'not_seated' };
  }

  if (!verifySeatToken(message.seatToken, seat.seatTokenHash)) {
    return { ok: false, code: 'invalid_seat_token' };
  }

  if (!isBetweenHands(table)) {
    return leaveMidHand(ctx, seat);
  }

  await ctx.store.deleteSeat(table.tableId, seat.seatId);
  await ctx.store.clearConnectionSeat(connection.connectionId);

  const updatedTable = await ctx.store.incrementTableVersion(table.tableId, table.version);
  if (!updatedTable) {
    return { ok: false, code: 'version_conflict' };
  }

  const remainingSeats = seats.filter((row) => row.seatId !== seat.seatId);
  return {
    ok: true,
    seatToken: '',
    seatId: seat.seatId,
    table: updatedTable,
    seats: remainingSeats,
  };
}

/**
 * Detaches the player now and folds them when the action reaches them; the
 * seat stays until the hand is over so pots and the button stay consistent.
 */
async function leaveMidHand(ctx: SitContext, seat: SeatRecord): Promise<SitResult> {
  const { connection, table, seats } = ctx;
  const { connectionId: _detached, ...rest } = seat;
  const departing: SeatRecord = {
    ...rest,
    awaySince: ctx.now ?? new Date().toISOString(),
    leaveAfterHand: true,
  };
  const marked = seats.map((row) => (row.seatId === seat.seatId ? departing : row));
  const folded = foldAwayActors({ ...table, version: table.version + 1 }, marked);

  const persisted = await ctx.store.updateTableWithVersion(
    table.tableId,
    table.version,
    folded.table,
    folded.seats,
  );
  if (!persisted) {
    return { ok: false, code: 'version_conflict' };
  }
  await ctx.store.clearConnectionSeat(connection.connectionId);

  return {
    ok: true,
    seatToken: '',
    seatId: seat.seatId,
    table: folded.table,
    seats: folded.seats,
  };
}

export function findSeatByToken(
  seats: SeatRecord[],
  seatToken: string,
): SeatRecord | null {
  return seats.find((seat) => verifySeatToken(seatToken, seat.seatTokenHash)) ?? null;
}
