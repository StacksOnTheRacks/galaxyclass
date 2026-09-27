import { applyAction, finalizeTerminalHand } from '../rules/index.js';
import type { Action, RulesErrorCode } from '../rules/types.js';
import {
  applyHandStateToSeats,
  applyHandStateToTable,
  isSeatAway,
  rehydrateHandState,
} from './hand-state.js';
import { findSeatByToken } from './sit.js';
import type { MatchStore } from './store.js';
import type { ClientMessage, ConnectionRecord, SeatRecord, TableRecord } from './types.js';

export type ActErrorCode =
  | 'invalid_seat_token'
  | 'not_seated'
  | 'client_supplied_state'
  | 'illegal_action'
  | 'off_turn'
  | 'all_in_or_side_pot_unsupported'
  | 'version_conflict'
  | 'hand_not_in_progress';

export interface ActContext {
  store: MatchStore;
  connection: ConnectionRecord;
  table: TableRecord;
  seats: SeatRecord[];
  message: ClientMessage;
}

export interface ActSuccess {
  ok: true;
  table: TableRecord;
  seats: SeatRecord[];
}

export interface ActFailure {
  ok: false;
  code: ActErrorCode;
}

export type ActResult = ActSuccess | ActFailure;

const BETTING_ACTIONS = new Set(['fold', 'check', 'call', 'bet', 'raise']);

export function isBettingAction(action: string): boolean {
  return BETTING_ACTIONS.has(action);
}

function parseBettingAction(message: ClientMessage): Action | null {
  switch (message.action) {
    case 'fold':
      return { type: 'fold' };
    case 'check':
      return { type: 'check' };
    case 'call':
      return { type: 'call' };
    case 'bet':
      if (typeof message.amount !== 'number' || !Number.isInteger(message.amount)) {
        return null;
      }
      return { type: 'bet', amount: message.amount };
    case 'raise':
      if (typeof message.amount !== 'number' || !Number.isInteger(message.amount)) {
        return null;
      }
      return { type: 'raise', amount: message.amount };
    default:
      return null;
  }
}

function mapRulesError(code: RulesErrorCode): ActErrorCode {
  switch (code) {
    case 'off_turn':
      return 'off_turn';
    case 'all_in_or_side_pot_unsupported':
      return 'all_in_or_side_pot_unsupported';
    default:
      return 'illegal_action';
  }
}

/**
 * Folds every away (disconnected) seat whose turn it is, so a dropped player
 * cannot stall the hand. Keeps the table version as given.
 */
export function foldAwayActors(
  table: TableRecord,
  seats: SeatRecord[],
): { table: TableRecord; seats: SeatRecord[] } {
  let currentTable = table;
  let currentSeats = seats;

  for (let guard = 0; guard < currentSeats.length; guard += 1) {
    if (currentTable.status !== 'hand_in_progress' || currentTable.phase !== 'betting') {
      break;
    }
    const actor = currentSeats.find((seat) => seat.seatId === currentTable.currentSeatId);
    if (!actor || !isSeatAway(actor)) {
      break;
    }
    const handState = rehydrateHandState(currentTable, currentSeats);
    if (!handState) {
      break;
    }
    const applied = applyAction(handState, actor.seatId, { type: 'fold' }, { allowAllIn: true });
    if (!applied.ok) {
      break;
    }
    const finalized = finalizeTerminalHand(applied.value);
    if (!finalized.ok) {
      break;
    }
    currentTable = applyHandStateToTable(currentTable, finalized.value, currentTable.version);
    currentSeats = applyHandStateToSeats(finalized.value, currentSeats);
  }

  return { table: currentTable, seats: currentSeats };
}

export async function handleAct(ctx: ActContext): Promise<ActResult> {
  const { connection, table, seats, message } = ctx;

  if (table.status !== 'hand_in_progress') {
    return { ok: false, code: 'hand_not_in_progress' };
  }

  if (!message.seatToken) {
    return { ok: false, code: 'invalid_seat_token' };
  }

  const callerSeat = findSeatByToken(seats, message.seatToken);
  if (!callerSeat || callerSeat.seatId !== connection.seatId) {
    return { ok: false, code: 'not_seated' };
  }

  if (table.phase === 'complete') {
    return { ok: false, code: 'illegal_action' };
  }

  if (table.phase === 'fold_to_one' || table.phase === 'showdown_ready') {
    return { ok: false, code: 'illegal_action' };
  }

  const action = parseBettingAction(message);
  if (!action) {
    return { ok: false, code: 'illegal_action' };
  }

  const handState = rehydrateHandState(table, seats);
  if (!handState) {
    return { ok: false, code: 'hand_not_in_progress' };
  }

  const applied = applyAction(handState, callerSeat.seatId, action, { allowAllIn: true });
  if (!applied.ok) {
    return { ok: false, code: mapRulesError(applied.error.code) };
  }

  const finalized = finalizeTerminalHand(applied.value);
  if (!finalized.ok) {
    return { ok: false, code: 'illegal_action' };
  }

  const folded = foldAwayActors(
    applyHandStateToTable(table, finalized.value, table.version + 1),
    applyHandStateToSeats(finalized.value, seats),
  );
  const updatedTable = folded.table;
  const updatedSeats = folded.seats;

  const persisted = await ctx.store.updateTableWithVersion(
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
