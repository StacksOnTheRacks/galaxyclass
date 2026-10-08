import { avatarIdForSeed } from '@galaxyclass/accounts/avatars';
import type { VerifiedPlayer } from '@galaxyclass/accounts/player-verifier';
import type { ErrorCode, ErrorMessage, ServerMessage, ShotEvent } from '../protocol.js';
import { AWAY_ABANDON_AFTER_MS, SEAT_IDS } from '../rules/constants.js';
import {
  abandonPlacing,
  beginPlacing,
  concede,
  fire,
  opponentOf,
  placeFleet,
  unready,
  voteRematch,
  withdrawRematchVote,
  type GameState,
  type RulesResult,
} from '../rules/game.js';
import type { Random } from '../rules/random.js';
import type { Coord, FleetError, SeatId } from '../rules/types.js';
import { randomGuestName } from './guest-name.js';
import { hashSeatToken, mintSeatToken, verifySeatToken } from './seat-token.js';
import type { TableCommit } from './store.js';
import type { ConnectionRecord, SeatRecord, StoredGame, TableRecord } from './types.js';

export type Change = Omit<TableCommit, 'expectedVersion'>;

export type ActionResult =
  | {
      ok: true;
      change: Change;
      reply?: ServerMessage;
      /** Sent to other connections after the commit lands. */
      notify?: Array<{ connectionId: string; message: ServerMessage }>;
      /** Sent to both seated captains after the commit lands and before their snapshots. */
      broadcast?: ServerMessage;
    }
  | { ok: false; error: ErrorMessage };

export interface StartOptions {
  firstSeatId?: SeatId;
}

export interface ActionContext {
  table: TableRecord;
  seats: SeatRecord[];
  connection: ConnectionRecord;
  random: Random;
  /** Epoch milliseconds. */
  now: number;
  startOptions?: (tableId: string) => StartOptions | undefined;
}

function fail(code: ErrorCode, reason?: FleetError): ActionResult {
  return { ok: false, error: { type: 'error', code, ...(reason ? { reason } : {}) } };
}

function bump(table: TableRecord): TableRecord {
  return { ...table, version: table.version + 1 };
}

function withGame(table: TableRecord, game: GameState): TableRecord {
  return { ...table, game: game as StoredGame };
}

function isPlaying(table: TableRecord): boolean {
  return table.game.status === 'placing' || table.game.status === 'battle';
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
 * Placement opens on its own once both seats are filled by connected captains, while the table is
 * waiting, or finished and someone new has just sat down. A coin flip picks who fires first.
 */
function withAutoStart(ctx: ActionContext, change: Change, seatedNew: boolean): Change {
  const { table } = ctx;
  const status = table.game.status;
  if (!(status === 'waiting' || (status === 'finished' && seatedNew))) {
    return change;
  }
  const removed = new Set(change.deleteSeatIds);
  const after = new Map(ctx.seats.filter((seat) => !removed.has(seat.seatId)).map((seat) => [seat.seatId, seat]));
  for (const seat of change.putSeats) {
    after.set(seat.seatId, seat);
  }
  if (!SEAT_IDS.every((seatId) => after.get(seatId)?.connectionId)) {
    return change;
  }
  const first = ctx.startOptions?.(table.tableId)?.firstSeatId ?? SEAT_IDS[ctx.random.int(SEAT_IDS.length)]!;
  const game = beginPlacing(table.game, [...SEAT_IDS], first);
  return { ...change, table: { ...withGame(change.table, game), gameNumber: table.gameNumber + 1 } };
}

/**
 * Binds an existing seat to this connection. The fleet and the turn are untouched. Whatever
 * connection held the seat before loses it and is told so.
 */
function bindSeat(ctx: ActionContext, seat: SeatRecord, seatToken: string, seatTokenHash: string): ActionResult {
  const { connectionId } = ctx.connection;
  const { awaySince: _away, ...held } = seat;
  const previous = seat.connectionId && seat.connectionId !== connectionId ? seat.connectionId : null;
  const change: Change = {
    table: bump(ctx.table),
    putSeats: [{ ...held, connectionId, seatTokenHash }],
    deleteSeatIds: [],
    connectionSeats: [{ connectionId, seatId: seat.seatId }],
  };
  return {
    ok: true,
    change: withAutoStart(ctx, change, false),
    reply: { type: 'sat', seatId: seat.seatId, seatToken },
    notify: previous ? [{ connectionId: previous, message: { type: 'left', seatId: seat.seatId, reason: 'taken_over' } }] : [],
  };
}

/**
 * Takes a held seat back with the seat token it was issued, from a new connection. The token alone
 * is not enough: the member who joined on this connection must be the one who sat, so another
 * account in the same browser profile cannot take the seat over with a token it finds in storage.
 */
export function resume(ctx: ActionContext, seatToken: unknown): ActionResult {
  const seat = ctx.seats.find((candidate) => verifySeatToken(seatToken, candidate.seatTokenHash));
  if (!seat) {
    return fail('invalid_seat_token');
  }
  if (!seat.playerSub || seat.playerSub !== ctx.connection.playerSub) {
    return fail('seat_not_yours');
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
  if (isPlaying(table)) {
    return fail('table_locked');
  }

  let seatId: SeatId;
  if (requestedSeatId === undefined) {
    const open = SEAT_IDS.find((id) => !seats.some((seat) => seat.seatId === id));
    if (!open) {
      return fail('table_full');
    }
    seatId = open;
  } else {
    if (typeof requestedSeatId !== 'string' || !(SEAT_IDS as readonly string[]).includes(requestedSeatId)) {
      return fail('invalid_seat');
    }
    if (seats.some((seat) => seat.seatId === requestedSeatId)) {
      return fail('seat_occupied');
    }
    seatId = requestedSeatId as SeatId;
  }

  const seatToken = mintSeatToken();
  const seat: SeatRecord = {
    seatId,
    displayName: player.gamerTag ?? randomGuestName(seats.map((s) => s.displayName), ctx.random),
    avatarId: player.avatarId ?? avatarIdForSeed(player.sub),
    playerSub: player.sub,
    seatTokenHash: hashSeatToken(seatToken),
    connectionId: connection.connectionId,
  };
  const change: Change = {
    table: bump(withGame(table, withdrawRematchVote(table.game, seatId))),
    putSeats: [seat],
    deleteSeatIds: [],
    connectionSeats: [{ connectionId: connection.connectionId, seatId }],
  };
  return { ok: true, change: withAutoStart(ctx, change, true), reply: { type: 'sat', seatId, seatToken } };
}

/** Frees a seat (a leave, or a disconnect outside a game). Its rematch vote goes with it. */
export function dropSeat(table: TableRecord, seatId: SeatId, connectionId?: string): Change {
  return {
    table: bump(withGame(table, withdrawRematchVote(table.game, seatId))),
    putSeats: [],
    deleteSeatIds: [seatId],
    connectionSeats: connectionId ? [{ connectionId, seatId: null }] : [],
  };
}

/**
 * A closed connection never costs a captain their place in a game: during placement and battle the
 * seat and fleet are held until they come back or are declared abandoned. Outside a game the seat frees up.
 */
export function disconnectSeat(table: TableRecord, seats: SeatRecord[], seatId: SeatId, now: number): Change {
  const seat = seats.find((candidate) => candidate.seatId === seatId);
  if (!seat || !isPlaying(table) || !table.game.players.includes(seatId)) {
    return dropSeat(table, seatId);
  }
  const { connectionId: _closed, ...held } = seat;
  return {
    table: bump(table),
    putSeats: [{ ...held, awaySince: new Date(now).toISOString() }],
    deleteSeatIds: [],
    connectionSeats: [],
  };
}

/** Leaving mid-battle concedes; leaving during placement sends the table back to waiting. */
export function leave(ctx: ActionContext, seatToken: unknown): ActionResult {
  const auth = authorizeSeat(ctx, seatToken);
  if (!auth.ok) {
    return auth;
  }
  const { seatId } = auth.seat;
  let table = ctx.table;
  if (table.game.status === 'battle') {
    const conceded = concede(table.game, seatId, 'forfeit');
    if (conceded.ok) {
      table = withGame(table, conceded.state);
    }
  } else if (table.game.status === 'placing') {
    table = withGame(table, abandonPlacing(table.game));
  }
  return {
    ok: true,
    change: dropSeat(table, seatId, ctx.connection.connectionId),
    reply: { type: 'left', seatId },
  };
}

function commitRules(ctx: ActionContext, result: RulesResult, extra: Partial<TableRecord> = {}): ActionResult {
  if (!result.ok) {
    return fail(result.code, result.reason);
  }
  return {
    ok: true,
    change: { table: bump({ ...withGame(ctx.table, result.state), ...extra }), putSeats: [], deleteSeatIds: [], connectionSeats: [] },
  };
}

export function placeFleetAction(ctx: ActionContext, seatToken: unknown, fleet: unknown): ActionResult {
  const auth = authorizeSeat(ctx, seatToken);
  if (!auth.ok) {
    return auth;
  }
  return commitRules(ctx, placeFleet(ctx.table.game, auth.seat.seatId, fleet, { now: ctx.now }));
}

export function unreadyAction(ctx: ActionContext, seatToken: unknown): ActionResult {
  const auth = authorizeSeat(ctx, seatToken);
  if (!auth.ok) {
    return auth;
  }
  return commitRules(ctx, unready(ctx.table.game, auth.seat.seatId));
}

export function fireAction(ctx: ActionContext, seatToken: unknown, target: Coord): ActionResult {
  const auth = authorizeSeat(ctx, seatToken);
  if (!auth.ok) {
    return auth;
  }
  const result = fire(ctx.table.game, auth.seat.seatId, target, { now: ctx.now, gameNumber: ctx.table.gameNumber });
  if (!result.ok) {
    return fail(result.code);
  }
  const { state, shot } = result;
  const event: ShotEvent = {
    ...shot,
    type: 'shot',
    tableId: ctx.table.tableId,
    nextSeatId: state.currentSeatId,
    turnOpensAt: state.turnOpensAt,
    winnerSeatId: state.winnerSeatId,
  };
  return {
    ok: true,
    change: { table: bump(withGame(ctx.table, state)), putSeats: [], deleteSeatIds: [], connectionSeats: [] },
    broadcast: event,
  };
}

export function forfeitAction(ctx: ActionContext, seatToken: unknown): ActionResult {
  const auth = authorizeSeat(ctx, seatToken);
  if (!auth.ok) {
    return auth;
  }
  return commitRules(ctx, concede(ctx.table.game, auth.seat.seatId, 'forfeit'));
}

/** When both captains have voted, the next game opens placement with the previous loser firing first. */
export function rematchAction(ctx: ActionContext, seatToken: unknown): ActionResult {
  const auth = authorizeSeat(ctx, seatToken);
  if (!auth.ok) {
    return auth;
  }
  const { game } = ctx.table;
  if (game.status !== 'finished') {
    return fail('not_finished');
  }
  const opponent = opponentOf(game, auth.seat.seatId);
  if (!opponent || !ctx.seats.some((seat) => seat.seatId === opponent)) {
    return fail('no_opponent');
  }
  const result = voteRematch(game, auth.seat.seatId);
  const restarted = result.ok && result.state.status === 'placing';
  return commitRules(ctx, result, restarted ? { gameNumber: ctx.table.gameNumber + 1 } : {});
}

/** The present captain wins once the other has been away past AWAY_ABANDON_AFTER_MS. */
export function claimAbandonedAction(ctx: ActionContext, seatToken: unknown): ActionResult {
  const auth = authorizeSeat(ctx, seatToken);
  if (!auth.ok) {
    return auth;
  }
  if (!isPlaying(ctx.table)) {
    return fail('not_in_battle');
  }
  const opponentId = opponentOf(ctx.table.game, auth.seat.seatId);
  const opponent = opponentId ? ctx.seats.find((seat) => seat.seatId === opponentId) : undefined;
  if (!opponentId || !opponent) {
    return fail('no_opponent');
  }
  if (opponent.connectionId) {
    return fail('opponent_not_away');
  }
  const since = opponent.awaySince ? Date.parse(opponent.awaySince) : Number.NaN;
  if (Number.isFinite(since) && ctx.now - since < AWAY_ABANDON_AFTER_MS) {
    return fail('away_too_recent');
  }
  return commitRules(ctx, concede(ctx.table.game, opponentId, 'abandoned'));
}
