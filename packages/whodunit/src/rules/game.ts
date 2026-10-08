import type { ErrorCode, GameEvent } from '../protocol.js';
import { occupiedHalls, pathTo, ROOM_LAYOUT, startPositions } from './board.js';
import { ALL_CARDS, isRoomId, isSuspectId, isWeaponId, matchingCards, sameSolution } from './cards.js';
import {
  ACCUSE_MS,
  DEPART_MS,
  GAME_OVER_MS,
  GAME_START_MS,
  MAX_LOG_EVENTS,
  MIN_PLAYERS,
  MOVE_LEAD_MS,
  MOVE_SETTLE_MS,
  MOVE_STEP_MS,
  PASS_BEAT_MS,
  PASSAGE_MS,
  REFUTE_MS,
  ROLL_MS,
  ROOM_IDS,
  SUGGEST_MS,
  SUSPECT_IDS,
  TURN_LOCK_GRACE_MS,
  TURN_PASS_MS,
  UNREFUTED_MS,
  WEAPON_IDS,
} from './constants.js';
import { rollDie, shuffle, type Random } from './random.js';
import type {
  CardId,
  DepartReason,
  Destination,
  EndReason,
  GameStatus,
  RoomId,
  SeatId,
  Solution,
  Suggestion,
  SuspectId,
  TokenPosition,
  TurnPhase,
  WeaponId,
} from './types.js';

/** A detective's choices at the table: kept from one case to the next, cleared when they leave. */
export interface SeatPick {
  suspect: SuspectId | null;
  ready: boolean;
}

/** The turn in progress. `startRoom` is server bookkeeping; the rest is public. */
export interface TurnState {
  phase: TurnPhase;
  dice: [number, number] | null;
  /** The room the detective's token stood in when the turn began. */
  startRoom: RoomId | null;
  enteredRoom: RoomId | null;
  suggestion: Suggestion | null;
  refuterSeatId: SeatId | null;
  passed: SeatId[];
}

/**
 * The whole case, as the rules engine sees it. Server-only: `solution` and `hands` never reach the
 * wire except through `buildSeatScopedSnapshot`, and `log` keeps every shown card unredacted.
 */
export interface GameState {
  status: GameStatus;
  picks: Partial<Record<SeatId, SeatPick>>;
  /** The detectives in this case, in seat (turn) order. Empty in setup. */
  players: SeatId[];
  solution: Solution | null;
  hands: Partial<Record<SeatId, CardId[]>>;
  positions: Record<SuspectId, TokenPosition>;
  weapons: Record<WeaponId, RoomId> | null;
  currentSeatId: SeatId | null;
  /** Turns begun this case; the first detective's first turn is 1. */
  turnNumber: number;
  turn: TurnState | null;
  /** Seats whose token a suggestion moved since their last turn: they may suggest without moving. */
  pulledIn: SeatId[];
  /** Accused wrongly or left: never takes another turn. */
  eliminated: SeatId[];
  /** Left mid-case: their cards are face up and they no longer refute. */
  departed: SeatId[];
  revealedCards: CardId[];
  /** Every event this case, unredacted. */
  log: GameEvent[];
  /** The last event's `seq`. */
  seq: number;
  /** Server epoch ms the next case action is accepted. */
  nextActionAt: number | null;
  winnerSeatId: SeatId | null;
  endReason: EndReason | null;
}

/** When and in which case an action happened; stamped on every event it produces. */
export interface EventClock {
  /** Server epoch ms. */
  now: number;
  gameNumber: number;
}

export type RulesResult = { ok: true; state: GameState; events: GameEvent[] } | { ok: false; code: ErrorCode };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type EventBody = DistributiveOmit<GameEvent, 'eventId' | 'gameNumber' | 'seq' | 'serverTs' | 'delayMs' | 'animationMs'>;

export interface Deal {
  solution: Solution;
  hands: Partial<Record<SeatId, CardId[]>>;
  weapons: Record<WeaponId, RoomId>;
}

export function emptyGame(): GameState {
  return {
    status: 'setup',
    picks: {},
    players: [],
    solution: null,
    hands: {},
    positions: startPositions(),
    weapons: null,
    currentSeatId: null,
    turnNumber: 0,
    turn: null,
    pulledIn: [],
    eliminated: [],
    departed: [],
    revealedCards: [],
    log: [],
    seq: 0,
    nextActionAt: null,
    winnerSeatId: null,
    endReason: null,
  };
}

function ok(state: GameState): RulesResult {
  return { ok: true, state, events: [] };
}

function fail(code: ErrorCode): RulesResult {
  return { ok: false, code };
}

function bySeat(a: SeatId, b: SeatId): number {
  return Number(a) - Number(b);
}

/** The suspect `seatId` plays, if any. */
export function suspectOf(state: GameState, seatId: SeatId): SuspectId | null {
  return state.picks[seatId]?.suspect ?? null;
}

/** The detective playing `suspect` in this case, if anyone is. */
export function seatPlaying(state: GameState, suspect: SuspectId): SeatId | null {
  return state.players.find((seatId) => suspectOf(state, seatId) === suspect) ?? null;
}

/**
 * The case file, the weapons' rooms, and every hand. Deterministic for a given random source, so a
 * scripted table can be replayed: the solution is drawn first, then the weapons are scattered one to
 * a room, then the other 18 cards are shuffled and dealt one at a time starting with `firstSeatId`.
 */
export function dealCase(players: readonly SeatId[], random: Random, firstSeatId: SeatId = players[0]!): Deal {
  const solution: Solution = {
    suspect: SUSPECT_IDS[random.int(SUSPECT_IDS.length)]!,
    weapon: WEAPON_IDS[random.int(WEAPON_IDS.length)]!,
    room: ROOM_IDS[random.int(ROOM_IDS.length)]!,
  };
  const rooms = shuffle(ROOM_IDS, random);
  const weapons = Object.fromEntries(WEAPON_IDS.map((id, i) => [id, rooms[i]!])) as Record<WeaponId, RoomId>;

  const seats = [...players].sort(bySeat);
  const start = Math.max(0, seats.indexOf(firstSeatId));
  const order = [...seats.slice(start), ...seats.slice(0, start)];
  const hands: Partial<Record<SeatId, CardId[]>> = Object.fromEntries(order.map((seatId) => [seatId, []]));
  const deck = shuffle(
    ALL_CARDS.filter((card) => card !== solution.suspect && card !== solution.weapon && card !== solution.room),
    random,
  );
  deck.forEach((card, i) => hands[order[i % order.length]!]!.push(card));
  return { solution, hands, weapons };
}

/** Collects the events one action produces, playing them back to back from `clock.now`. */
function script(state: GameState, clock: EventClock) {
  const events: GameEvent[] = [];
  let seq = state.seq;
  let elapsed = 0;
  return {
    emit(body: EventBody, animationMs: number): void {
      seq += 1;
      events.push({
        ...body,
        eventId: `${clock.gameNumber}-${seq}`,
        gameNumber: clock.gameNumber,
        seq,
        serverTs: clock.now,
        delayMs: elapsed,
        animationMs,
      } as GameEvent);
      elapsed += animationMs;
    },
    /** Appends the events to the log and holds the next action until they have played. */
    done(next: GameState): RulesResult {
      return {
        ok: true,
        events,
        state: {
          ...next,
          seq,
          log: [...next.log, ...events].slice(-MAX_LOG_EVENTS),
          nextActionAt: next.status === 'playing' ? clock.now + elapsed - TURN_LOCK_GRACE_MS : null,
        },
      };
    },
  };
}

type Script = ReturnType<typeof script>;

function openTurn(state: GameState, seatId: SeatId): TurnState {
  const suspect = suspectOf(state, seatId);
  const at = suspect ? state.positions[suspect] : null;
  return {
    phase: 'start',
    dice: null,
    startRoom: at?.kind === 'room' ? at.room : null,
    enteredRoom: null,
    suggestion: null,
    refuterSeatId: null,
    passed: [],
  };
}

/** The players after `seatId`, clockwise (in seat order, wrapping), not including `seatId`. */
function clockwiseFrom(state: GameState, seatId: SeatId): SeatId[] {
  const at = state.players.indexOf(seatId);
  return [...state.players.slice(at + 1), ...state.players.slice(0, Math.max(0, at))];
}

/** The next detective still in the running after `seatId`, or `seatId` itself when nobody else is. */
function nextActive(state: GameState, seatId: SeatId): SeatId | null {
  const next = clockwiseFrom(state, seatId).find((id) => !state.eliminated.includes(id));
  if (next) return next;
  return state.eliminated.includes(seatId) ? null : seatId;
}

function finish(state: GameState, s: Script, reason: EndReason, winnerSeatId: SeatId | null): RulesResult {
  s.emit({ kind: 'game_over', winnerSeatId, reason, solution: state.solution! }, GAME_OVER_MS);
  return s.done({
    ...state,
    status: 'finished',
    currentSeatId: null,
    turn: null,
    pulledIn: [],
    winnerSeatId,
    endReason: reason,
  });
}

/** Hands the turn from `seatId` to the next detective in the running, clearing `seatId`'s pull. */
function passTurn(state: GameState, s: Script, seatId: SeatId): GameState {
  const nextSeatId = nextActive(state, seatId);
  if (!nextSeatId) return state;
  s.emit({ kind: 'turn_passed', seatId, nextSeatId }, TURN_PASS_MS);
  const settled = { ...state, pulledIn: state.pulledIn.filter((id) => id !== seatId) };
  return { ...settled, currentSeatId: nextSeatId, turnNumber: state.turnNumber + 1, turn: openTurn(settled, nextSeatId) };
}

/**
 * Ends the case if it can no longer go on: fewer than two detectives left at the table, or every
 * one of them has accused wrongly. Otherwise null.
 */
function settle(state: GameState, s: Script): RulesResult | null {
  const present = state.players.filter((id) => !state.departed.includes(id));
  if (present.length < 2) return finish(state, s, 'abandoned', null);
  if (present.every((id) => state.eliminated.includes(id))) return finish(state, s, 'unsolved', null);
  return null;
}

// ---------------------------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------------------------

/** Setup only: claims an unclaimed suspect and clears ready. */
export function chooseSuspect(state: GameState, seatId: SeatId, suspect: unknown): RulesResult {
  if (state.status !== 'setup') return fail('not_setup');
  if (!isSuspectId(suspect)) return fail('invalid_suspect');
  const taken = Object.entries(state.picks).some(([id, pick]) => id !== seatId && pick?.suspect === suspect);
  if (taken) return fail('suspect_taken');
  return ok({ ...state, picks: { ...state.picks, [seatId]: { suspect, ready: false } } });
}

/** Setup only. Ready needs a suspect; unready always works. */
export function setReady(state: GameState, seatId: SeatId, ready: boolean): RulesResult {
  if (state.status !== 'setup') return fail('not_setup');
  const pick = state.picks[seatId] ?? { suspect: null, ready: false };
  if (ready && !pick.suspect) return fail('no_suspect');
  return ok({ ...state, picks: { ...state.picks, [seatId]: { ...pick, ready } } });
}

/** A seat emptied outside a case: its suspect is free again. */
export function withdrawPick(state: GameState, seatId: SeatId): GameState {
  if (!(seatId in state.picks)) return state;
  const { [seatId]: _gone, ...picks } = state.picks;
  return { ...state, picks };
}

export interface StartInput {
  /** Every occupied seat. */
  seated: readonly SeatId[];
  /** The occupied seats with an open connection. */
  connected: readonly SeatId[];
  /** Goes first when seated; otherwise a random detective does. */
  firstSeatId?: SeatId;
}

/**
 * Setup → playing. Every seated detective must have a suspect, be ready, and be connected, and there
 * must be at least MIN_PLAYERS. Deals the case with `dealRandom` (or `random`) so a scripted table can
 * fix the deal while the dice stay random.
 */
export function startGame(
  state: GameState,
  input: StartInput,
  random: Random,
  clock: EventClock,
  dealRandom: Random = random,
): RulesResult {
  if (state.status !== 'setup') return fail('not_setup');
  const players = [...input.seated].sort(bySeat);
  if (players.length < MIN_PLAYERS) return fail('not_enough_players');
  const allSet = players.every(
    (id) => state.picks[id]?.suspect && state.picks[id]?.ready && input.connected.includes(id),
  );
  if (!allSet) return fail('players_not_ready');

  const firstSeatId =
    input.firstSeatId && players.includes(input.firstSeatId) ? input.firstSeatId : players[random.int(players.length)]!;
  const deal = dealCase(players, dealRandom, firstSeatId);
  const picks = Object.fromEntries(players.map((id) => [id, state.picks[id]!])) as GameState['picks'];
  const begun: GameState = {
    ...emptyGame(),
    status: 'playing',
    picks,
    players,
    solution: deal.solution,
    hands: deal.hands,
    weapons: deal.weapons,
    currentSeatId: firstSeatId,
    turnNumber: 1,
  };
  const s = script(begun, clock);
  s.emit({ kind: 'game_started', firstSeatId, weapons: deal.weapons }, GAME_START_MS);
  return s.done({ ...begun, turn: openTurn(begun, firstSeatId) });
}

/** Finished → setup, for the detectives still seated, keeping their suspects. */
export function newCase(state: GameState, seated: readonly SeatId[]): RulesResult {
  if (state.status !== 'finished') return fail('not_finished');
  const picks: GameState['picks'] = {};
  for (const seatId of seated) {
    const suspect = state.picks[seatId]?.suspect ?? null;
    picks[seatId] = { suspect, ready: false };
  }
  return ok({ ...emptyGame(), picks });
}

// ---------------------------------------------------------------------------------------------
// The case
// ---------------------------------------------------------------------------------------------

/** Status, turn, and turn lock, in that order: the checks every turn action shares. */
function turnCheck(state: GameState, seatId: SeatId, clock: EventClock): ErrorCode | null {
  if (state.status !== 'playing') return 'not_playing';
  if (state.eliminated.includes(seatId) && state.players.includes(seatId)) return 'eliminated';
  if (state.currentSeatId !== seatId || !state.turn) return 'not_your_turn';
  if (state.nextActionAt !== null && clock.now < state.nextActionAt) return 'turn_not_open';
  return null;
}

function positionOf(state: GameState, seatId: SeatId): TokenPosition | null {
  const suspect = suspectOf(state, seatId);
  return suspect ? state.positions[suspect] : null;
}

/** Phase `start`: two dice. */
export function roll(state: GameState, seatId: SeatId, random: Random, clock: EventClock): RulesResult {
  const blocked = turnCheck(state, seatId, clock);
  if (blocked) return fail(blocked);
  const turn = state.turn!;
  if (turn.phase !== 'start') return fail('wrong_phase');
  const dice: [number, number] = [rollDie(random), rollDie(random)];
  const s = script(state, clock);
  s.emit({ kind: 'rolled', seatId, dice }, ROLL_MS);
  return s.done({ ...state, turn: { ...turn, phase: 'moving', dice } });
}

/** The room a secret passage from `room` leads to, if it has one. */
export function passageFrom(room: RoomId): RoomId | null {
  return ROOM_LAYOUT[room].passage ?? null;
}

export function moveAnimationMs(steps: number): number {
  return MOVE_LEAD_MS + steps * MOVE_STEP_MS + MOVE_SETTLE_MS;
}

/** Phase `start`, in a corner room: through the passage, instead of rolling. */
export function takePassage(state: GameState, seatId: SeatId, clock: EventClock): RulesResult {
  const blocked = turnCheck(state, seatId, clock);
  if (blocked) return fail(blocked);
  const turn = state.turn!;
  if (turn.phase !== 'start') return fail('wrong_phase');
  const from = positionOf(state, seatId);
  const to = from?.kind === 'room' ? passageFrom(from.room) : null;
  if (!from || !to) return fail('no_passage');
  const suspect = suspectOf(state, seatId)!;
  const s = script(state, clock);
  s.emit({ kind: 'moved', seatId, suspect, via: 'passage', path: [from, { kind: 'room', room: to }] }, PASSAGE_MS);
  return s.done({
    ...state,
    positions: { ...state.positions, [suspect]: { kind: 'room', room: to } },
    turn: { ...turn, phase: 'moved', enteredRoom: to },
  });
}

/**
 * Phase `moving`: walks the token to `to`, which must be reachable with the roll (up to the dice
 * total, never through another token, never back into the room the turn began in).
 */
export function move(state: GameState, seatId: SeatId, to: Destination, clock: EventClock): RulesResult {
  const blocked = turnCheck(state, seatId, clock);
  if (blocked) return fail(blocked);
  const turn = state.turn!;
  if (turn.phase !== 'moving' || !turn.dice) return fail('wrong_phase');
  const suspect = suspectOf(state, seatId)!;
  const from = state.positions[suspect];
  const steps = turn.dice[0] + turn.dice[1];
  const path = pathTo(from, to, steps, occupiedHalls(state.positions, suspect), { excludeRoom: turn.startRoom });
  if (!path) return fail('unreachable');
  const end = path.at(-1)!;
  const s = script(state, clock);
  s.emit({ kind: 'moved', seatId, suspect, via: 'walk', path }, moveAnimationMs(path.length - 1));
  return s.done({
    ...state,
    positions: { ...state.positions, [suspect]: end },
    turn: { ...turn, phase: 'moved', enteredRoom: end.kind === 'room' ? end.room : null },
  });
}

/** Whether `seatId` may make a suggestion right now (ignoring the turn lock). */
export function canSuggest(state: GameState, seatId: SeatId): boolean {
  const turn = state.turn;
  if (state.status !== 'playing' || state.currentSeatId !== seatId || !turn) return false;
  const at = positionOf(state, seatId);
  if (at?.kind !== 'room') return false;
  if (turn.phase === 'moved') return turn.enteredRoom === at.room;
  return turn.phase === 'start' && state.pulledIn.includes(seatId);
}

/**
 * Names a suspect and weapon in the suggester's room. Both tokens are pulled into the room; a
 * detective whose token moved may suggest from there next turn. Then each other detective in turn,
 * clockwise, is asked: the first holding a named card must show one (eliminated detectives still
 * answer; detectives who left do not, their cards are already face up).
 */
export function suggest(state: GameState, seatId: SeatId, suspect: unknown, weapon: unknown, clock: EventClock): RulesResult {
  const blocked = turnCheck(state, seatId, clock);
  if (blocked) return fail(blocked);
  if (!isSuspectId(suspect)) return fail('invalid_suspect');
  if (!isWeaponId(weapon)) return fail('invalid_weapon');
  if (!canSuggest(state, seatId)) return fail('cannot_suggest');
  const room = (positionOf(state, seatId) as { kind: 'room'; room: RoomId }).room;
  const suggestion: Suggestion = { suspect, weapon, room };

  const suspectFrom = state.positions[suspect];
  const weaponFrom = state.weapons![weapon];
  const moved = !(suspectFrom.kind === 'room' && suspectFrom.room === room);
  const owner = seatPlaying(state, suspect);
  const pulledSeatId = moved && owner && owner !== seatId && !state.departed.includes(owner) ? owner : null;

  const passed: SeatId[] = [];
  let refuterSeatId: SeatId | null = null;
  for (const other of clockwiseFrom(state, seatId)) {
    if (state.departed.includes(other)) continue;
    if (matchingCards(state.hands[other] ?? [], suggestion).length > 0) {
      refuterSeatId = other;
      break;
    }
    passed.push(other);
  }

  const s = script(state, clock);
  s.emit(
    { kind: 'suggested', seatId, suspect, weapon, room, suspectFrom, weaponFrom, pulledSeatId, passed, refuterSeatId },
    SUGGEST_MS + passed.length * PASS_BEAT_MS + (refuterSeatId ? 0 : UNREFUTED_MS),
  );
  return s.done({
    ...state,
    positions: { ...state.positions, [suspect]: { kind: 'room', room } },
    weapons: { ...state.weapons!, [weapon]: room },
    pulledIn: pulledSeatId && !state.pulledIn.includes(pulledSeatId) ? [...state.pulledIn, pulledSeatId] : state.pulledIn,
    turn: { ...state.turn!, phase: refuterSeatId ? 'refuting' : 'suggested', suggestion, refuterSeatId, passed },
  });
}

/** The refuter privately shows the suggester one of their matching cards. */
export function showCard(state: GameState, seatId: SeatId, card: unknown, clock: EventClock): RulesResult {
  if (state.status !== 'playing') return fail('not_playing');
  const turn = state.turn;
  if (!turn || turn.phase !== 'refuting' || turn.refuterSeatId !== seatId || !turn.suggestion) return fail('not_refuter');
  if (state.nextActionAt !== null && clock.now < state.nextActionAt) return fail('turn_not_open');
  if (typeof card !== 'string' || !ALL_CARDS.includes(card as CardId)) return fail('invalid_card');
  if (!matchingCards(state.hands[seatId] ?? [], turn.suggestion).includes(card as CardId)) return fail('cannot_show');
  const s = script(state, clock);
  s.emit({ kind: 'refuted', suggesterSeatId: state.currentSeatId!, refuterSeatId: seatId, card: card as CardId }, REFUTE_MS);
  return s.done({ ...state, turn: { ...turn, phase: 'suggested', refuterSeatId: null } });
}

/**
 * Names the case file, any time in your turn except while a card is being shown. Right wins; wrong
 * takes you out of the running (you still answer suggestions) and passes the turn.
 */
export function accuse(
  state: GameState,
  seatId: SeatId,
  accusation: { suspect: unknown; weapon: unknown; room: unknown },
  clock: EventClock,
): RulesResult {
  const blocked = turnCheck(state, seatId, clock);
  if (blocked) return fail(blocked);
  if (state.turn!.phase === 'refuting') return fail('wrong_phase');
  const { suspect, weapon, room } = accusation;
  if (!isSuspectId(suspect)) return fail('invalid_suspect');
  if (!isWeaponId(weapon)) return fail('invalid_weapon');
  if (!isRoomId(room)) return fail('invalid_room');
  const correct = sameSolution({ suspect, weapon, room }, state.solution!);
  const s = script(state, clock);
  s.emit({ kind: 'accused', seatId, suspect, weapon, room, correct }, ACCUSE_MS);
  if (correct) return finish(state, s, 'solved', seatId);
  const out: GameState = { ...state, eliminated: [...state.eliminated, seatId] };
  return settle(out, s) ?? s.done(passTurn(out, s, seatId));
}

/** Any phase but `refuting`: the turn passes clockwise to the next detective in the running. */
export function endTurn(state: GameState, seatId: SeatId, clock: EventClock): RulesResult {
  const blocked = turnCheck(state, seatId, clock);
  if (blocked) return fail(blocked);
  if (state.turn!.phase === 'refuting') return fail('wrong_phase');
  const s = script(state, clock);
  return s.done(passTurn(state, s, seatId));
}

/**
 * Detectives leave mid-case (or are declared gone): out of the running, cards laid face up. The
 * case ends if fewer than two remain; a departing detective's turn passes; a refutation waiting on
 * them moves on to the next detective clockwise who can answer.
 */
export function depart(
  state: GameState,
  seats: SeatId | readonly SeatId[],
  reason: DepartReason,
  clock: EventClock,
): RulesResult {
  if (state.status !== 'playing') return fail('not_playing');
  const leaving = typeof seats === 'string' ? [seats] : [...seats];
  if (!leaving.length || leaving.some((id) => !state.players.includes(id) || state.departed.includes(id))) {
    return fail('not_seated');
  }
  const s = script(state, clock);
  let next = state;
  for (const seatId of leaving) {
    const revealed = [...(next.hands[seatId] ?? [])];
    s.emit({ kind: 'departed', seatId, reason, revealed }, DEPART_MS);
    next = {
      ...next,
      departed: [...next.departed, seatId],
      eliminated: next.eliminated.includes(seatId) ? next.eliminated : [...next.eliminated, seatId],
      pulledIn: next.pulledIn.filter((id) => id !== seatId),
      revealedCards: [...next.revealedCards, ...revealed],
    };
    const ended = settle(next, s);
    if (ended) return ended;

    const turn = next.turn!;
    if (next.currentSeatId === seatId) {
      next = passTurn(next, s, seatId);
    } else if (turn.phase === 'refuting' && turn.refuterSeatId === seatId && turn.suggestion) {
      const after = next;
      const ahead = clockwiseFrom(after, seatId);
      const asked = ahead.slice(0, ahead.indexOf(after.currentSeatId!)).filter((id) => !after.departed.includes(id));
      const at = asked.findIndex((id) => matchingCards(after.hands[id] ?? [], turn.suggestion!).length > 0);
      const refuterSeatId = at >= 0 ? asked[at]! : null;
      const passed = [...turn.passed, ...(at >= 0 ? asked.slice(0, at) : asked)];
      next = { ...after, turn: { ...turn, phase: refuterSeatId ? 'refuting' : 'suggested', refuterSeatId, passed } };
    }
  }
  return s.done(next);
}
