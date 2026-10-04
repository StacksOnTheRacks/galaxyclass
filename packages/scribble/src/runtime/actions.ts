import { randomAvatarId } from '@galaxyclass/accounts/avatars';
import type { VerifiedPlayer } from '@galaxyclass/accounts/player-verifier';
import type { Random } from '../rules/bag.js';
import type { Dictionary } from '../rules/dictionary.js';
import {
  addPlayer,
  applyExchange,
  applyPass,
  applyPlay,
  MIN_PLAYERS,
  removePlayer,
  startGame,
  type GameState,
  type StartOptions,
  type TurnResult,
} from '../rules/game.js';
import type { Placement } from '../rules/types.js';
import { isThemeId } from '../themes/ids.js';
import { fromGameState, toGameState } from './game-state.js';
import { randomGuestName } from './guest-name.js';
import { hashSeatToken, mintSeatToken, verifySeatToken } from './seat-token.js';
import type { TableCommit } from './store.js';
import type { ConnectionRecord, ErrorMessage, OutboundMessage, SeatRecord, TableRecord } from './types.js';

export type Change = Omit<TableCommit, 'expectedVersion'>;

export type ActionResult =
  | { ok: true; change: Change; reply?: OutboundMessage }
  | { ok: false; error: ErrorMessage };

export interface ActionContext {
  table: TableRecord;
  seats: SeatRecord[];
  connection: ConnectionRecord;
  random: Random;
  startOptions?: (tableId: string) => StartOptions | undefined;
}

function fail(code: string, extra: Omit<ErrorMessage, 'type' | 'code'> = {}): ActionResult {
  return { ok: false, error: { type: 'error', code, ...extra } };
}

function bump(table: TableRecord): TableRecord {
  return { ...table, version: table.version + 1 };
}

function noChange(table: TableRecord): Change {
  return { table: bump(table), putSeats: [], deleteSeatIds: [], connectionSeats: [] };
}

/**
 * The seat token is the authority to act. It must hash to an occupied seat, and that seat must be
 * the one this connection sat in, so a token copied to another connection does nothing.
 */
export function authorizeSeat(
  ctx: ActionContext,
  seatToken: unknown,
): { ok: true; seat: SeatRecord } | { ok: false; error: ErrorMessage } {
  const seat = ctx.seats.find((candidate) => verifySeatToken(seatToken, candidate.seatTokenHash));
  if (!seat) {
    return { ok: false, error: { type: 'error', code: 'invalid_seat_token' } };
  }
  if (ctx.connection.seatId !== seat.seatId || seat.connectionId !== ctx.connection.connectionId) {
    return { ok: false, error: { type: 'error', code: 'not_seated' } };
  }
  return { ok: true, seat };
}

export function sit(
  ctx: ActionContext,
  requestedSeatId: unknown,
  player: VerifiedPlayer | null,
): ActionResult {
  const { table, seats, connection } = ctx;
  if (connection.seatId && seats.some((seat) => seat.seatId === connection.seatId)) {
    return fail('already_seated');
  }
  if (player && seats.some((seat) => seat.playerSub === player.sub)) {
    return fail('account_already_seated');
  }

  let seatId: string;
  if (requestedSeatId === undefined) {
    const open = Array.from({ length: table.maxSeats }, (_, i) => String(i + 1)).find(
      (id) => !seats.some((seat) => seat.seatId === id),
    );
    if (!open) {
      return fail('table_full');
    }
    seatId = open;
  } else {
    const n = typeof requestedSeatId === 'string' ? Number(requestedSeatId) : Number.NaN;
    if (!Number.isInteger(n) || n < 1 || n > table.maxSeats || String(n) !== requestedSeatId) {
      return fail('invalid_seat');
    }
    if (seats.some((seat) => seat.seatId === requestedSeatId)) {
      return fail('seat_occupied');
    }
    seatId = requestedSeatId;
  }

  const seatToken = mintSeatToken();
  const taken = seats.map((seat) => seat.displayName);
  let seat: SeatRecord = {
    seatId,
    displayName: player?.gamerTag ?? randomGuestName(taken, ctx.random),
    avatarId: player?.avatarId ?? randomAvatarId(() => ctx.random.int(1_000_000) / 1_000_000),
    ...(player ? { playerSub: player.sub } : {}),
    seatTokenHash: hashSeatToken(seatToken),
    connectionId: connection.connectionId,
    rack: [],
    score: 0,
  };

  let nextTable = table;
  // With an empty bag a late sitter could only pass, so they wait for the next game instead.
  if (table.game.status === 'playing' && table.game.bag.length > 0) {
    const state = addPlayer(toGameState(table, seats), seatId);
    const joined = state.players[seatId]!;
    seat = { ...seat, rack: joined.rack, score: joined.score };
    nextTable = fromGameState(table, seats, state).table;
  }

  return {
    ok: true,
    change: {
      table: bump(nextTable),
      putSeats: [seat],
      deleteSeatIds: [],
      connectionSeats: [{ connectionId: connection.connectionId, seatId }],
    },
    reply: { type: 'sat', seatId, seatToken },
  };
}

/**
 * Leave and disconnect share this. Between turns the seat drops at once; on your turn the
 * rules engine auto-passes first. Rack tiles go back in the bag.
 */
export function dropSeat(
  table: TableRecord,
  seats: SeatRecord[],
  seatId: string,
  random: Random,
  connectionId?: string,
): Change {
  const inGame = table.game.turnOrder.includes(seatId);
  let nextTable = table;
  let putSeats: SeatRecord[] = [];
  if (inGame) {
    const state = removePlayer(toGameState(table, seats), seatId, random);
    const split = fromGameState(table, seats, state);
    nextTable = split.table;
    putSeats = split.changedSeats.filter((seat) => seat.seatId !== seatId);
  }
  return {
    table: bump(nextTable),
    putSeats,
    deleteSeatIds: [seatId],
    connectionSeats: connectionId ? [{ connectionId, seatId: null }] : [],
  };
}

export function leave(ctx: ActionContext, seatToken: unknown): ActionResult {
  const auth = authorizeSeat(ctx, seatToken);
  if (!auth.ok) {
    return auth;
  }
  return {
    ok: true,
    change: dropSeat(ctx.table, ctx.seats, auth.seat.seatId, ctx.random, ctx.connection.connectionId),
    reply: { type: 'left', seatId: auth.seat.seatId },
  };
}

export function start(ctx: ActionContext, seatToken: unknown): ActionResult {
  const auth = authorizeSeat(ctx, seatToken);
  if (!auth.ok) {
    return auth;
  }
  if (ctx.table.game.status === 'playing') {
    return fail('game_in_progress');
  }
  if (ctx.seats.length < MIN_PLAYERS) {
    return fail('insufficient_players');
  }
  const state = startGame(
    ctx.seats.map((seat) => seat.seatId),
    ctx.random,
    ctx.startOptions?.(ctx.table.tableId),
  )!;
  return commitGame(ctx, state);
}

function commitGame(ctx: ActionContext, state: GameState): ActionResult {
  const split = fromGameState(ctx.table, ctx.seats, state);
  return {
    ok: true,
    change: { table: bump(split.table), putSeats: split.changedSeats, deleteSeatIds: [], connectionSeats: [] },
  };
}

function turnResult(ctx: ActionContext, result: TurnResult): ActionResult {
  if (!result.ok) {
    const { ok: _ok, code, ...detail } = result;
    return fail(code, detail);
  }
  return commitGame(ctx, result.state);
}

export function play(
  ctx: ActionContext,
  seatToken: unknown,
  placements: Placement[] | null,
  dictionary: Dictionary,
): ActionResult {
  const auth = authorizeSeat(ctx, seatToken);
  if (!auth.ok) {
    return auth;
  }
  if (!placements) {
    return fail('invalid_placement', { reason: 'empty' });
  }
  return turnResult(ctx, applyPlay(toGameState(ctx.table, ctx.seats), auth.seat.seatId, placements, dictionary));
}

export function pass(ctx: ActionContext, seatToken: unknown): ActionResult {
  const auth = authorizeSeat(ctx, seatToken);
  if (!auth.ok) {
    return auth;
  }
  return turnResult(ctx, applyPass(toGameState(ctx.table, ctx.seats), auth.seat.seatId));
}

export function exchange(ctx: ActionContext, seatToken: unknown, tileIds: string[] | null): ActionResult {
  const auth = authorizeSeat(ctx, seatToken);
  if (!auth.ok) {
    return auth;
  }
  if (!tileIds) {
    return fail('invalid_exchange');
  }
  return turnResult(
    ctx,
    applyExchange(toGameState(ctx.table, ctx.seats), auth.seat.seatId, tileIds, ctx.random),
  );
}

/** Any seated player may change the theme; it applies to everyone at the table. */
export function setTheme(ctx: ActionContext, seatToken: unknown, themeId: unknown): ActionResult {
  const auth = authorizeSeat(ctx, seatToken);
  if (!auth.ok) {
    return auth;
  }
  if (!isThemeId(themeId)) {
    return fail('invalid_theme');
  }
  return { ok: true, change: noChange({ ...ctx.table, themeId }) };
}
