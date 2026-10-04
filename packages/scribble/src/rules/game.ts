import { createBag, draw, shuffle, type Random } from './bag.js';
import type { Dictionary } from './dictionary.js';
import { checkPlacement } from './placement.js';
import { scorePlay } from './score.js';
import { RACK_SIZE, rackValue } from './tiles.js';
import type { BoardTile, Placement, PlacementError, ScoreBeat, Tile } from './types.js';

import { EXCHANGE_MIN_BAG, MAX_PLAYERS, MIN_PLAYERS, SCORELESS_TURN_LIMIT } from './limits.js';

export { EXCHANGE_MIN_BAG, MAX_PLAYERS, MIN_PLAYERS, SCORELESS_TURN_LIMIT };

export type GameStatus = 'waiting' | 'playing' | 'ended';
export type EndReason = 'played_out' | 'scoreless_turns' | 'abandoned';

export interface PlayerState {
  rack: Tile[];
  score: number;
}

/** What everyone at the table may see about the last committed turn. */
export interface LastTurn {
  turnNumber: number;
  seatId: string;
  kind: 'play' | 'pass' | 'exchange' | 'auto_pass';
  placed: Array<{ row: number; col: number; letter: string; blank: boolean }>;
  words: Array<{ text: string; cells: Array<{ row: number; col: number }>; score: number }>;
  beats: ScoreBeat[];
  total: number;
  bingo: boolean;
  exchanged: number;
}

export interface GameState {
  status: GameStatus;
  board: BoardTile[];
  bag: Tile[];
  players: Record<string, PlayerState>;
  turnOrder: string[];
  currentSeatId: string | null;
  scorelessTurns: number;
  turnNumber: number;
  lastTurn: LastTurn | null;
  endReason: EndReason | null;
  /** Per-seat end-of-game rack adjustment (negative for leftovers, positive for the player who went out). */
  finalAdjustments: Record<string, number> | null;
  wentOutSeatId: string | null;
}

export type TurnError =
  | { code: 'game_not_in_progress' }
  | { code: 'off_turn' }
  | { code: 'invalid_placement'; reason: PlacementError }
  | { code: 'invalid_word'; words: string[] }
  | { code: 'exchange_unavailable' }
  | { code: 'invalid_exchange' };

export type TurnResult = { ok: true; state: GameState } | ({ ok: false } & TurnError);

export function emptyGame(): GameState {
  return {
    status: 'waiting',
    board: [],
    bag: [],
    players: {},
    turnOrder: [],
    currentSeatId: null,
    scorelessTurns: 0,
    turnNumber: 0,
    lastTurn: null,
    endReason: null,
    finalAdjustments: null,
    wentOutSeatId: null,
  };
}

/** Only the local dev harness sets these, so its scripted table deals a known game. */
export interface StartOptions {
  bag?: Tile[];
  firstSeatId?: string;
}

/** Deals a fresh game to the seated players. The first player is drawn at random. */
export function startGame(
  seatIds: ReadonlyArray<string>,
  random: Random,
  options: StartOptions = {},
): GameState | null {
  if (seatIds.length < MIN_PLAYERS || seatIds.length > MAX_PLAYERS) {
    return null;
  }
  let bag = options.bag ? [...options.bag] : createBag(random);
  const players: Record<string, PlayerState> = {};
  for (const seatId of seatIds) {
    const result = draw(bag, RACK_SIZE);
    bag = result.bag;
    players[seatId] = { rack: result.drawn, score: 0 };
  }
  const turnOrder = [...seatIds];
  return {
    ...emptyGame(),
    status: 'playing',
    bag,
    players,
    turnOrder,
    currentSeatId:
      options.firstSeatId && turnOrder.includes(options.firstSeatId)
        ? options.firstSeatId
        : turnOrder[random.int(turnOrder.length)]!,
  };
}

function guardTurn(state: GameState, seatId: string): TurnError | null {
  if (state.status !== 'playing' || !state.players[seatId]) {
    return { code: 'game_not_in_progress' };
  }
  if (state.currentSeatId !== seatId) {
    return { code: 'off_turn' };
  }
  return null;
}

function nextSeat(state: GameState, seatId: string): string | null {
  const order = state.turnOrder;
  if (order.length === 0) {
    return null;
  }
  const index = order.indexOf(seatId);
  return order[(index + 1) % order.length]!;
}

function emptyTurn(state: GameState, seatId: string, kind: LastTurn['kind']): LastTurn {
  return {
    turnNumber: state.turnNumber + 1,
    seatId,
    kind,
    placed: [],
    words: [],
    beats: [],
    total: 0,
    bingo: false,
    exchanged: 0,
  };
}

/** Records a scoreless turn and ends the game when the limit is reached. */
function finishScorelessTurn(state: GameState, seatId: string, turn: LastTurn): GameState {
  const scorelessTurns = state.scorelessTurns + 1;
  const next: GameState = {
    ...state,
    scorelessTurns,
    turnNumber: turn.turnNumber,
    lastTurn: turn,
    currentSeatId: nextSeat(state, seatId),
  };
  return scorelessTurns >= SCORELESS_TURN_LIMIT ? endGame(next, 'scoreless_turns', null) : next;
}

export function applyPlay(
  state: GameState,
  seatId: string,
  placements: ReadonlyArray<Placement>,
  dictionary: Dictionary,
): TurnResult {
  const guard = guardTurn(state, seatId);
  if (guard) {
    return { ok: false, ...guard };
  }
  const player = state.players[seatId]!;
  const placement = checkPlacement(state.board, player.rack, placements);
  if (!placement.ok) {
    return { ok: false, code: 'invalid_placement', reason: placement.reason };
  }
  const rejected = [...new Set(placement.words.map((word) => word.text).filter((text) => !dictionary.has(text)))];
  if (rejected.length > 0) {
    return { ok: false, code: 'invalid_word', words: rejected };
  }

  const score = scorePlay(placement.words, placement.placed.length);
  const refill = draw(state.bag, placement.placed.length);
  const newScore = player.score + score.total;
  const rack = [...placement.rackAfter, ...refill.drawn];
  const turn: LastTurn = {
    ...emptyTurn(state, seatId, 'play'),
    placed: placement.placed.map(({ row, col, letter, blank }) => ({ row, col, letter, blank })),
    words: placement.words.map((word, index) => ({
      text: word.text,
      cells: word.cells.map(({ row, col }) => ({ row, col })),
      score: score.wordScores[index]!,
    })),
    beats: [...score.beats, { kind: 'total', total: score.total, score: newScore }],
    total: score.total,
    bingo: score.bingo,
  };

  const next: GameState = {
    ...state,
    board: [...state.board, ...placement.placed],
    bag: refill.bag,
    players: { ...state.players, [seatId]: { rack, score: newScore } },
    scorelessTurns: score.total > 0 ? 0 : state.scorelessTurns + 1,
    turnNumber: turn.turnNumber,
    lastTurn: turn,
    currentSeatId: nextSeat(state, seatId),
  };

  if (rack.length === 0 && refill.bag.length === 0) {
    return { ok: true, state: endGame(next, 'played_out', seatId) };
  }
  if (next.scorelessTurns >= SCORELESS_TURN_LIMIT) {
    return { ok: true, state: endGame(next, 'scoreless_turns', null) };
  }
  return { ok: true, state: next };
}

export function applyPass(state: GameState, seatId: string, kind: 'pass' | 'auto_pass' = 'pass'): TurnResult {
  const guard = guardTurn(state, seatId);
  if (guard) {
    return { ok: false, ...guard };
  }
  return { ok: true, state: finishScorelessTurn(state, seatId, emptyTurn(state, seatId, kind)) };
}

export function applyExchange(
  state: GameState,
  seatId: string,
  tileIds: ReadonlyArray<string>,
  random: Random,
): TurnResult {
  const guard = guardTurn(state, seatId);
  if (guard) {
    return { ok: false, ...guard };
  }
  if (state.bag.length < EXCHANGE_MIN_BAG) {
    return { ok: false, code: 'exchange_unavailable' };
  }
  const player = state.players[seatId]!;
  const wanted = new Set(tileIds);
  if (wanted.size === 0 || wanted.size !== tileIds.length || ![...wanted].every((id) => player.rack.some((t) => t.id === id))) {
    return { ok: false, code: 'invalid_exchange' };
  }
  const returned = player.rack.filter((tile) => wanted.has(tile.id));
  const kept = player.rack.filter((tile) => !wanted.has(tile.id));
  const refill = draw(state.bag, returned.length);
  const turn = { ...emptyTurn(state, seatId, 'exchange'), exchanged: returned.length };
  const swapped: GameState = {
    ...state,
    bag: shuffle([...refill.bag, ...returned], random),
    players: { ...state.players, [seatId]: { ...player, rack: [...kept, ...refill.drawn] } },
  };
  return { ok: true, state: finishScorelessTurn(swapped, seatId, turn) };
}

/**
 * Subtracts each rack from its owner. When someone went out, they gain the sum of everyone else's leftovers.
 * Abandoned games end without adjustment.
 */
export function endGame(state: GameState, reason: EndReason, wentOutSeatId: string | null): GameState {
  if (reason === 'abandoned') {
    return { ...state, status: 'ended', endReason: reason, currentSeatId: null, finalAdjustments: null, wentOutSeatId: null };
  }
  const adjustments: Record<string, number> = {};
  let leftovers = 0;
  for (const seatId of state.turnOrder) {
    const remaining = rackValue(state.players[seatId]!.rack);
    adjustments[seatId] = -remaining;
    leftovers += remaining;
  }
  if (wentOutSeatId) {
    adjustments[wentOutSeatId] = (adjustments[wentOutSeatId] ?? 0) + leftovers;
  }
  const players: Record<string, PlayerState> = {};
  for (const [seatId, player] of Object.entries(state.players)) {
    players[seatId] = { ...player, score: player.score + (adjustments[seatId] ?? 0) };
  }
  return {
    ...state,
    status: 'ended',
    endReason: reason,
    currentSeatId: null,
    players,
    finalAdjustments: adjustments,
    wentOutSeatId,
  };
}

/** A player sitting down mid-game draws a rack and joins at the end of the turn order. */
export function addPlayer(state: GameState, seatId: string): GameState {
  if (state.status !== 'playing' || state.players[seatId]) {
    return state;
  }
  const refill = draw(state.bag, RACK_SIZE);
  return {
    ...state,
    bag: refill.bag,
    players: { ...state.players, [seatId]: { rack: refill.drawn, score: 0 } },
    turnOrder: [...state.turnOrder, seatId],
  };
}

/**
 * Leave and disconnect: on your turn the server auto-passes first, then the seat drops.
 * The departing rack returns to the bag. Fewer than two players left abandons the game.
 */
export function removePlayer(state: GameState, seatId: string, random: Random): GameState {
  if (!state.players[seatId]) {
    return state;
  }
  let current = state;
  if (current.status === 'playing' && current.currentSeatId === seatId) {
    const passed = applyPass(current, seatId, 'auto_pass');
    if (passed.ok) {
      current = passed.state;
    }
  }
  const { [seatId]: leaving, ...players } = current.players;
  const turnOrder = current.turnOrder.filter((id) => id !== seatId);
  if (current.status !== 'playing') {
    return { ...current, players, turnOrder };
  }
  const next: GameState = {
    ...current,
    players,
    turnOrder,
    bag: shuffle([...current.bag, ...(leaving?.rack ?? [])], random),
    currentSeatId: current.currentSeatId === seatId ? (turnOrder[0] ?? null) : current.currentSeatId,
  };
  return turnOrder.length < MIN_PLAYERS ? endGame(next, 'abandoned', null) : next;
}
