import { avatarIdForSeed } from '@galaxyclass/accounts/avatars';
import type { VerifiedPlayer } from '@galaxyclass/accounts/player-verifier';
import type { Random } from '../rules/bag.js';
import type { Dictionary } from '../rules/dictionary.js';
import {
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
import { AWAY_REMOVE_AFTER_MS } from '../rules/limits.js';
import type { Placement } from '../rules/types.js';
import { isThemeId } from '../themes/ids.js';
import { fromGameState, toGameState } from './game-state.js';
import { randomGuestName } from './guest-name.js';
import { hashSeatToken, mintSeatToken, verifySeatToken } from './seat-token.js';
import type { TableCommit } from './store.js';
import type { ConnectionRecord, ErrorMessage, OutboundMessage, SeatRecord, TableRecord } from './types.js';

export type Change = Omit<TableCommit, 'expectedVersion'>;

export type ActionResult =
  | {
      ok: true;
      change: Change;
      reply?: OutboundMessage;
      /** Sent to other connections after the commit lands. */
      notify?: Array<{ connectionId: string; message: OutboundMessage }>;
    }
  | { ok: false; error: ErrorMessage };

export interface ActionContext {
  table: TableRecord;
  seats: SeatRecord[];
  connection: ConnectionRecord;
  random: Random;
  /** Epoch milliseconds. */
  now: number;
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

function seatOf(ctx: ActionContext): SeatRecord | undefined {
  const { connection } = ctx;
  return ctx.seats.find((seat) => seat.seatId === connection.seatId && seat.connectionId === connection.connectionId);
}

/**
 * Binds an existing seat to this connection. Rack, score, and place in the turn order are untouched.
 * Whatever connection held the seat before loses it and is told so.
 */
function bindSeat(ctx: ActionContext, seat: SeatRecord, seatToken: string, seatTokenHash: string): ActionResult {
  const { connectionId } = ctx.connection;
  const { awaySince: _away, ...held } = seat;
  const previous = seat.connectionId && seat.connectionId !== connectionId ? seat.connectionId : null;
  return {
    ok: true,
    change: {
      table: bump(ctx.table),
      putSeats: [{ ...held, connectionId, seatTokenHash }],
      deleteSeatIds: [],
      connectionSeats: [{ connectionId, seatId: seat.seatId }],
    },
    reply: { type: 'sat', seatId: seat.seatId, seatToken },
    notify: previous ? [{ connectionId: previous, message: { type: 'left', seatId: seat.seatId, reason: 'taken_over' } }] : [],
  };
}

/** Takes a held seat back with the seat token it was issued, from a new connection. */
export function resume(ctx: ActionContext, seatToken: unknown): ActionResult {
  const seat = ctx.seats.find((candidate) => verifySeatToken(seatToken, candidate.seatTokenHash));
  if (!seat) {
    return fail('invalid_seat_token');
  }
  const mine = seatOf(ctx);
  if (mine && mine.seatId !== seat.seatId) {
    return fail('already_seated');
  }
  return bindSeat(ctx, seat, seatToken as string, seat.seatTokenHash);
}

export function sit(ctx: ActionContext, requestedSeatId: unknown, player: VerifiedPlayer): ActionResult {
  const { table, seats, connection } = ctx;
  if (seatOf(ctx)) {
    return fail('already_seated');
  }
  const held = seats.find((seat) => seat.playerSub === player.sub);
  if (held) {
    // The account proves the seat is theirs, so a new device gets a fresh token and the old one dies.
    const token = mintSeatToken();
    return bindSeat(ctx, held, token, hashSeatToken(token));
  }
  if (table.game.status === 'playing') {
    return fail('table_locked');
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
  const seat: SeatRecord = {
    seatId,
    displayName: player.gamerTag ?? randomGuestName(taken, ctx.random),
    avatarId: player.avatarId ?? avatarIdForSeed(player.sub),
    playerSub: player.sub,
    seatTokenHash: hashSeatToken(seatToken),
    connectionId: connection.connectionId,
    rack: [],
    score: 0,
  };

  return {
    ok: true,
    change: {
      table: bump(table),
      putSeats: [seat],
      deleteSeatIds: [],
      connectionSeats: [{ connectionId: connection.connectionId, seatId }],
    },
    reply: { type: 'sat', seatId, seatToken },
  };
}

/**
 * Frees a seat: an explicit leave, removing an away player, or a disconnect outside a game.
 * Between turns the seat drops at once; on your turn the rules engine auto-passes first.
 * Rack tiles go back in the bag.
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

/**
 * A closed connection never costs a player their place in a game: the seat, rack, and turn are
 * held until they come back. Outside a game there is nothing to hold, so the seat frees up.
 */
export function disconnectSeat(
  table: TableRecord,
  seats: SeatRecord[],
  seatId: string,
  random: Random,
  now: number,
): Change {
  const seat = seats.find((candidate) => candidate.seatId === seatId);
  if (!seat || table.game.status !== 'playing' || !table.game.turnOrder.includes(seatId)) {
    return dropSeat(table, seats, seatId, random);
  }
  const { connectionId: _closed, ...held } = seat;
  return {
    table: bump(table),
    putSeats: [{ ...held, awaySince: new Date(now).toISOString() }],
    deleteSeatIds: [],
    connectionSeats: [],
  };
}

/** Any seated player may free the seat of someone who has been away past the grace period. */
export function removeAway(ctx: ActionContext, seatToken: unknown, targetSeatId: unknown): ActionResult {
  const auth = authorizeSeat(ctx, seatToken);
  if (!auth.ok) {
    return auth;
  }
  const target = ctx.seats.find((seat) => seat.seatId === targetSeatId);
  if (!target || target.seatId === auth.seat.seatId) {
    return fail('invalid_seat');
  }
  if (target.connectionId) {
    return fail('player_not_away');
  }
  const since = target.awaySince ? Date.parse(target.awaySince) : Number.NaN;
  if (Number.isFinite(since) && ctx.now - since < AWAY_REMOVE_AFTER_MS) {
    return fail('away_too_recent');
  }
  return { ok: true, change: dropSeat(ctx.table, ctx.seats, target.seatId, ctx.random) };
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
  // Seats still held from the last game for someone who is away are not dealt in; they free up.
  const present = ctx.seats.filter((seat) => seat.connectionId);
  if (present.length < MIN_PLAYERS) {
    return fail('insufficient_players');
  }
  const state = startGame(
    present.map((seat) => seat.seatId),
    ctx.random,
    ctx.startOptions?.(ctx.table.tableId),
  )!;
  const split = fromGameState(ctx.table, present, state);
  return {
    ok: true,
    change: {
      table: bump({ ...split.table, gameNumber: ctx.table.gameNumber + 1 }),
      putSeats: split.changedSeats,
      deleteSeatIds: ctx.seats.filter((seat) => !seat.connectionId).map((seat) => seat.seatId),
      connectionSeats: [],
    },
  };
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
