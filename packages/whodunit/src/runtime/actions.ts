import { avatarIdForSeed } from '@galaxyclass/accounts/avatars';
import type { VerifiedPlayer } from '@galaxyclass/accounts/player-verifier';
import type { ErrorCode, ErrorMessage, GameEvent, ServerMessage } from '../protocol.js';
import { AWAY_ABANDON_AFTER_MS, SEAT_IDS, SETUP_AWAY_AFTER_MS } from '../rules/constants.js';
import {
  accuse,
  chooseSuspect,
  depart,
  endTurn,
  move,
  newCase,
  roll,
  setReady,
  showCard,
  startGame,
  suggest,
  takePassage,
  withdrawPick,
  type EventClock,
  type GameState,
  type RulesResult,
} from '../rules/game.js';
import { seededRandom, type Random } from '../rules/random.js';
import type { Destination, SeatId } from '../rules/types.js';
import { randomGuestName } from './guest-name.js';
import { hashSeatToken, mintSeatToken, verifySeatToken } from './seat-token.js';
import { hostSeatOf } from './snapshot.js';
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
      /** Sent to each detective in the case, redacted for them, after the commit lands and before their snapshots. */
      events?: GameEvent[];
    }
  | { ok: false; error: ErrorMessage };

/** Dev and tests: pin parts of a table's case instead of leaving them to chance. */
export interface StartOptions {
  /** Takes the first turn when seated. */
  firstSeatId?: SeatId;
  /** Deals with `seededRandom(dealSeed)`, so the case file is known in advance (see `dealCase`). */
  dealSeed?: number;
  /** Rolls each turn's dice from this seed and the case's event count, so a scripted game replays. */
  diceSeed?: number;
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

function fail(code: ErrorCode): ActionResult {
  return { ok: false, error: { type: 'error', code } };
}

function bump(table: TableRecord): TableRecord {
  return { ...table, version: table.version + 1 };
}

function withGame(table: TableRecord, game: GameState): TableRecord {
  return { ...table, game: game as StoredGame };
}

function clockOf(ctx: ActionContext): EventClock {
  return { now: ctx.now, gameNumber: ctx.table.gameNumber };
}

/** In the case being played, and still at the table. */
function inCase(table: TableRecord, seatId: SeatId): boolean {
  const { game } = table;
  return game.status === 'playing' && game.players.includes(seatId) && !game.departed.includes(seatId);
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
 * Binds an existing seat to this connection. The hand and the turn are untouched. Whatever
 * connection held the seat before loses it and is told so.
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

/** Setup or finished: a new detective joins for the next case. Mid-case the table is locked. */
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
  return {
    ok: true,
    change: {
      table: bump(withGame(table, withdrawPick(table.game, seatId))),
      putSeats: [seat],
      deleteSeatIds: [],
      connectionSeats: [{ connectionId: connection.connectionId, seatId }],
    },
    reply: { type: 'sat', seatId, seatToken },
  };
}

/** Frees a seat (a leave, or a disconnect outside a case). Outside a case its suspect is free again. */
export function dropSeat(table: TableRecord, seatId: SeatId, connectionId?: string): Change {
  const game = table.game.status === 'playing' ? table.game : withdrawPick(table.game, seatId);
  return {
    table: bump(withGame(table, game)),
    putSeats: [],
    deleteSeatIds: [seatId],
    connectionSeats: connectionId ? [{ connectionId, seatId: null }] : [],
  };
}

/**
 * A closed connection never costs a detective their place: in setup and mid-case the seat (and the
 * hand) is held until they come back, leave, or are declared gone. After a case the seat frees up.
 */
export function disconnectSeat(table: TableRecord, seats: SeatRecord[], seatId: SeatId, now: number): Change {
  const seat = seats.find((candidate) => candidate.seatId === seatId);
  if (!seat || !(table.game.status === 'setup' || inCase(table, seatId))) {
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

/** Leaving mid-case takes you out of the running and lays your cards face up for everyone. */
export function leave(ctx: ActionContext, seatToken: unknown): ActionResult {
  const auth = authorizeSeat(ctx, seatToken);
  if (!auth.ok) {
    return auth;
  }
  const { seatId } = auth.seat;
  let table = ctx.table;
  let events: GameEvent[] = [];
  if (inCase(table, seatId)) {
    const departed = depart(table.game, seatId, 'left', clockOf(ctx));
    if (departed.ok) {
      table = withGame(table, departed.state);
      events = departed.events;
    }
  }
  return {
    ok: true,
    change: dropSeat(table, seatId, ctx.connection.connectionId),
    reply: { type: 'left', seatId },
    events,
  };
}

function commitRules(ctx: ActionContext, result: RulesResult, extra: Partial<TableRecord> = {}): ActionResult {
  if (!result.ok) {
    return fail(result.code);
  }
  return {
    ok: true,
    change: { table: bump({ ...withGame(ctx.table, result.state), ...extra }), putSeats: [], deleteSeatIds: [], connectionSeats: [] },
    events: result.events,
  };
}

/** Authorizes the seat token, then runs a rules step as that seat. */
function asSeat(
  ctx: ActionContext,
  seatToken: unknown,
  step: (game: GameState, seatId: SeatId) => RulesResult,
): ActionResult {
  const auth = authorizeSeat(ctx, seatToken);
  if (!auth.ok) {
    return auth;
  }
  return commitRules(ctx, step(ctx.table.game, auth.seat.seatId));
}

export function chooseSuspectAction(ctx: ActionContext, seatToken: unknown, suspect: unknown): ActionResult {
  return asSeat(ctx, seatToken, (game, seatId) => chooseSuspect(game, seatId, suspect));
}

export function readyAction(ctx: ActionContext, seatToken: unknown, ready: boolean): ActionResult {
  return asSeat(ctx, seatToken, (game, seatId) => setReady(game, seatId, ready));
}

/** The host opens the case: the case file is drawn, the weapons scattered, the cards dealt. */
export function startGameAction(ctx: ActionContext, seatToken: unknown): ActionResult {
  const auth = authorizeSeat(ctx, seatToken);
  if (!auth.ok) {
    return auth;
  }
  const { table, seats } = ctx;
  if (table.game.status !== 'setup') {
    return fail('not_setup');
  }
  if (hostSeatOf(table, seats) !== auth.seat.seatId) {
    return fail('not_host');
  }
  const options = ctx.startOptions?.(table.tableId);
  const result = startGame(
    table.game,
    {
      seated: seats.map((seat) => seat.seatId),
      connected: seats.filter((seat) => seat.connectionId).map((seat) => seat.seatId),
      ...(options?.firstSeatId ? { firstSeatId: options.firstSeatId } : {}),
    },
    ctx.random,
    { now: ctx.now, gameNumber: table.gameNumber + 1 },
    options?.dealSeed !== undefined ? seededRandom(options.dealSeed) : ctx.random,
  );
  return commitRules(ctx, result, { gameNumber: table.gameNumber + 1 });
}

/** Mixes a scripted dice seed with the case's progress so each roll differs but replays exactly. */
function diceRandom(ctx: ActionContext): Random {
  const seed = ctx.startOptions?.(ctx.table.tableId)?.diceSeed;
  if (seed === undefined) {
    return ctx.random;
  }
  return seededRandom((seed ^ Math.imul(ctx.table.game.seq + 1, 0x9e3779b1)) >>> 0);
}

export function rollAction(ctx: ActionContext, seatToken: unknown): ActionResult {
  return asSeat(ctx, seatToken, (game, seatId) => roll(game, seatId, diceRandom(ctx), clockOf(ctx)));
}

export function takePassageAction(ctx: ActionContext, seatToken: unknown): ActionResult {
  return asSeat(ctx, seatToken, (game, seatId) => takePassage(game, seatId, clockOf(ctx)));
}

export function moveAction(ctx: ActionContext, seatToken: unknown, to: Destination): ActionResult {
  return asSeat(ctx, seatToken, (game, seatId) => move(game, seatId, to, clockOf(ctx)));
}

export function suggestAction(ctx: ActionContext, seatToken: unknown, suspect: unknown, weapon: unknown): ActionResult {
  return asSeat(ctx, seatToken, (game, seatId) => suggest(game, seatId, suspect, weapon, clockOf(ctx)));
}

export function showCardAction(ctx: ActionContext, seatToken: unknown, card: unknown): ActionResult {
  return asSeat(ctx, seatToken, (game, seatId) => showCard(game, seatId, card, clockOf(ctx)));
}

export function accuseAction(
  ctx: ActionContext,
  seatToken: unknown,
  accusation: { suspect: unknown; weapon: unknown; room: unknown },
): ActionResult {
  return asSeat(ctx, seatToken, (game, seatId) => accuse(game, seatId, accusation, clockOf(ctx)));
}

export function endTurnAction(ctx: ActionContext, seatToken: unknown): ActionResult {
  return asSeat(ctx, seatToken, (game, seatId) => endTurn(game, seatId, clockOf(ctx)));
}

/** Finished, host only: back to setup with everyone still seated, suspects kept, nobody ready. */
export function newGameAction(ctx: ActionContext, seatToken: unknown): ActionResult {
  const auth = authorizeSeat(ctx, seatToken);
  if (!auth.ok) {
    return auth;
  }
  if (ctx.table.game.status !== 'finished') {
    return fail('not_finished');
  }
  if (hostSeatOf(ctx.table, ctx.seats) !== auth.seat.seatId) {
    return fail('not_host');
  }
  return commitRules(ctx, newCase(ctx.table.game, ctx.seats.map((seat) => seat.seatId)));
}

/**
 * Clears every seat whose detective has been away long enough: SETUP_AWAY_AFTER_MS before a case
 * (so one closed tab does not hold up the table), AWAY_ABANDON_AFTER_MS mid-case (their cards are
 * laid face up, as if they had left).
 */
export function claimAbandonedAction(ctx: ActionContext, seatToken: unknown): ActionResult {
  const auth = authorizeSeat(ctx, seatToken);
  if (!auth.ok) {
    return auth;
  }
  const { table } = ctx;
  const status = table.game.status;
  if (status === 'finished') {
    return fail('not_playing');
  }
  const away = ctx.seats.filter(
    (seat) => !seat.connectionId && (status === 'setup' || inCase(table, seat.seatId)),
  );
  if (!away.length) {
    return fail('no_one_away');
  }
  const limit = status === 'setup' ? SETUP_AWAY_AFTER_MS : AWAY_ABANDON_AFTER_MS;
  const gone = away
    .filter((seat) => {
      const since = seat.awaySince ? Date.parse(seat.awaySince) : Number.NaN;
      return !Number.isFinite(since) || ctx.now - since >= limit;
    })
    .map((seat) => seat.seatId);
  if (!gone.length) {
    return fail('away_too_recent');
  }

  let game = table.game;
  let events: GameEvent[] = [];
  if (status === 'playing') {
    const departed = depart(game, gone, 'abandoned', clockOf(ctx));
    if (!departed.ok) {
      return fail(departed.code);
    }
    game = departed.state;
    events = departed.events;
  } else {
    game = gone.reduce(withdrawPick, game);
  }
  return {
    ok: true,
    change: { table: bump(withGame(table, game)), putSeats: [], deleteSeatIds: gone, connectionSeats: [] },
    events,
  };
}
