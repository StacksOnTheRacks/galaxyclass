import type { ErrorCode } from '../protocol.js';
import { BATTLE_START_MS, SHOT_ANIMATION_MS, SINK_ANNOUNCE_MS, TURN_LOCK_GRACE_MS } from './constants.js';
import { inBounds, shipAt, sunkShips, validateFleet } from './fleet.js';
import type { Coord, EndReason, Fleet, FleetError, GameStatus, SeatId, ShotMark, ShotRecord, SunkShip } from './types.js';

/** One captain's side. Server-only: the fleet is never sent to the other captain before the game ends. */
export interface PlayerBoard {
  fleet: Fleet | null;
  ready: boolean;
}

/**
 * The whole game, as the rules engine sees it. Shots received by a board are derived from `history`
 * (`shot.target === seatId`), so there is one source of truth for every mark on both boards.
 */
export interface GameState {
  status: GameStatus;
  /** The two seats in this game, in seat order. Empty while waiting. */
  players: SeatId[];
  boards: Partial<Record<SeatId, PlayerBoard>>;
  /** Fires first this game: a coin flip for game 1, the previous loser after a rematch. */
  firstSeatId: SeatId | null;
  currentSeatId: SeatId | null;
  /** Shots fired so far this game; the next shot is `turnNumber + 1`. */
  turnNumber: number;
  /** Server epoch ms the current turn accepts a shot. */
  turnOpensAt: number | null;
  history: ShotRecord[];
  winnerSeatId: SeatId | null;
  endReason: EndReason | null;
  rematchVotes: SeatId[];
}

export type RulesResult = { ok: true; state: GameState } | { ok: false; code: ErrorCode; reason?: FleetError };

export type FireResult = { ok: true; state: GameState; shot: ShotRecord } | { ok: false; code: ErrorCode };

export interface RulesClock {
  /** Server epoch ms. */
  now: number;
}

export function emptyGame(): GameState {
  return {
    status: 'waiting',
    players: [],
    boards: {},
    firstSeatId: null,
    currentSeatId: null,
    turnNumber: 0,
    turnOpensAt: null,
    history: [],
    winnerSeatId: null,
    endReason: null,
    rematchVotes: [],
  };
}

/** The seat facing `seatId` in this game, if any. */
export function opponentOf(state: GameState, seatId: SeatId): SeatId | null {
  if (!state.players.includes(seatId)) return null;
  return state.players.find((id) => id !== seatId) ?? null;
}

/** Every shot fired at `seatId` this game, as board marks. */
export function incomingMarks(state: GameState, seatId: SeatId): ShotMark[] {
  return state.history.filter((shot) => shot.target === seatId).map(toMark);
}

export function toMark(shot: ShotRecord): ShotMark {
  return { row: shot.coord.row, col: shot.coord.col, result: shot.result, turnNumber: shot.turnNumber };
}

/** Both seats are filled: open placement. Boards start empty and not ready. */
export function beginPlacing(_state: GameState, players: [SeatId, SeatId], firstSeatId: SeatId): GameState {
  return {
    ...emptyGame(),
    status: 'placing',
    players: [...players].sort(),
    boards: Object.fromEntries(players.map((seatId) => [seatId, { fleet: null, ready: false }])),
    firstSeatId,
  };
}

/**
 * Validates and locks in a fleet (ready). When the other captain is already ready, battle starts:
 * `currentSeatId = firstSeatId`, `turnOpensAt = now + BATTLE_START_MS`.
 */
export function placeFleet(state: GameState, seatId: SeatId, fleet: unknown, clock: RulesClock): RulesResult {
  if (state.status !== 'placing') return { ok: false, code: 'not_placing' };
  const opponent = opponentOf(state, seatId);
  if (!opponent) return { ok: false, code: 'not_seated' };
  const validation = validateFleet(fleet);
  if (!validation.ok) return { ok: false, code: 'invalid_fleet', reason: validation.reason };

  const boards = { ...state.boards, [seatId]: { fleet: validation.fleet, ready: true } };
  if (!boards[opponent]?.ready) return { ok: true, state: { ...state, boards } };
  const first = state.firstSeatId ?? state.players[0]!;
  return {
    ok: true,
    state: {
      ...state,
      boards,
      status: 'battle',
      currentSeatId: first,
      turnNumber: 0,
      turnOpensAt: clock.now + BATTLE_START_MS,
    },
  };
}

/** Placing only, while the other captain is not yet ready. Keeps the fleet. */
export function unready(state: GameState, seatId: SeatId): RulesResult {
  if (state.status !== 'placing') return { ok: false, code: 'not_placing' };
  const opponent = opponentOf(state, seatId);
  if (!opponent) return { ok: false, code: 'not_seated' };
  if (state.boards[opponent]?.ready) return { ok: false, code: 'not_placing' };
  const board = state.boards[seatId] ?? { fleet: null, ready: false };
  return { ok: true, state: { ...state, boards: { ...state.boards, [seatId]: { ...board, ready: false } } } };
}

/**
 * Resolves one shot. Classic rules: one shot per turn, and the turn always passes, hit or miss.
 * Sets `turnOpensAt = now + animationMs - TURN_LOCK_GRACE_MS`; sinking the last ship finishes the game.
 */
export function fire(
  state: GameState,
  seatId: SeatId,
  target: Coord,
  context: RulesClock & { gameNumber: number },
): FireResult {
  if (state.status !== 'battle') return { ok: false, code: 'not_in_battle' };
  if (state.currentSeatId !== seatId) return { ok: false, code: 'not_your_turn' };
  if (state.turnOpensAt !== null && context.now < state.turnOpensAt) return { ok: false, code: 'turn_not_open' };
  if (!isCoord(target) || !inBounds(target)) return { ok: false, code: 'invalid_target' };
  const opponent = opponentOf(state, seatId);
  const fleet = opponent ? state.boards[opponent]?.fleet : null;
  if (!opponent || !fleet) return { ok: false, code: 'not_in_battle' };
  const alreadyFired = state.history.some(
    (shot) => shot.shooter === seatId && shot.coord.row === target.row && shot.coord.col === target.col,
  );
  if (alreadyFired) return { ok: false, code: 'already_fired' };

  const coord = { row: target.row, col: target.col };
  const turnNumber = state.turnNumber + 1;
  const hitShip = shipAt(fleet, coord);
  const result = hitShip ? 'hit' : 'miss';

  let sunkShip: SunkShip | undefined;
  let gameOver = false;
  if (hitShip) {
    const incoming = [...incomingMarks(state, opponent), { ...coord, result, turnNumber } satisfies ShotMark];
    const sunk = sunkShips(fleet, incoming);
    sunkShip = sunk.find((ship) => ship.shipId === hitShip);
    gameOver = sunk.length === fleet.length;
  }

  const animationMs = shotAnimationMs(Boolean(sunkShip));
  const shot: ShotRecord = {
    shotId: `${context.gameNumber}-${turnNumber}`,
    gameNumber: context.gameNumber,
    turnNumber,
    shooter: seatId,
    target: opponent,
    coord,
    result,
    ...(sunkShip ? { sunkShip } : {}),
    gameOver,
    serverTs: context.now,
    animationMs,
  };

  const next: GameState = {
    ...state,
    turnNumber,
    history: [...state.history, shot],
    ...(gameOver
      ? {
          status: 'finished' as const,
          winnerSeatId: seatId,
          endReason: 'fleet_sunk' as const,
          currentSeatId: null,
          turnOpensAt: null,
          rematchVotes: [],
        }
      : {
          currentSeatId: opponent,
          turnOpensAt: context.now + animationMs - TURN_LOCK_GRACE_MS,
        }),
  };
  return { ok: true, state: next, shot };
}

function isCoord(value: unknown): value is Coord {
  return (
    typeof value === 'object' &&
    value !== null &&
    Number.isInteger((value as Coord).row) &&
    Number.isInteger((value as Coord).col)
  );
}

/** Placing or battle: `seatId` concedes (`forfeit`) or is declared gone (`abandoned`); the other seat wins. */
export function concede(state: GameState, seatId: SeatId, reason: Exclude<EndReason, 'fleet_sunk'>): RulesResult {
  if (state.status !== 'placing' && state.status !== 'battle') return { ok: false, code: 'not_in_battle' };
  const winner = opponentOf(state, seatId);
  if (!winner) return { ok: false, code: 'not_seated' };
  return {
    ok: true,
    state: {
      ...state,
      status: 'finished',
      winnerSeatId: winner,
      endReason: reason,
      currentSeatId: null,
      turnOpensAt: null,
      rematchVotes: [],
    },
  };
}

/**
 * Finished only. When every seat in `players` has voted, returns a fresh placing state whose
 * `firstSeatId` is the previous loser; the runtime bumps the table's game number.
 */
export function voteRematch(state: GameState, seatId: SeatId): RulesResult {
  if (state.status !== 'finished') return { ok: false, code: 'not_finished' };
  if (!state.players.includes(seatId)) return { ok: false, code: 'not_seated' };
  const rematchVotes = state.rematchVotes.includes(seatId)
    ? state.rematchVotes
    : [...state.rematchVotes, seatId].sort();
  if (!state.players.every((id) => rematchVotes.includes(id))) {
    return { ok: true, state: { ...state, rematchVotes } };
  }
  const [a, b] = state.players as [SeatId, SeatId];
  const loser = state.winnerSeatId ? opponentOf(state, state.winnerSeatId) : null;
  const first = loser ?? (state.firstSeatId === a ? b : a);
  return { ok: true, state: beginPlacing(state, [a, b], first) };
}

/** A seat left or dropped while finished: its rematch vote no longer counts. */
export function withdrawRematchVote(state: GameState, seatId: SeatId): GameState {
  if (!state.rematchVotes.includes(seatId)) return state;
  return { ...state, rematchVotes: state.rematchVotes.filter((id) => id !== seatId) };
}

/** A captain left during placement: back to waiting, both boards cleared. */
export function abandonPlacing(_state: GameState): GameState {
  return emptyGame();
}

/** SHOT_ANIMATION_MS, plus SINK_ANNOUNCE_MS when the shot sank a ship. */
export function shotAnimationMs(sunk: boolean): number {
  return SHOT_ANIMATION_MS + (sunk ? SINK_ANNOUNCE_MS : 0);
}
