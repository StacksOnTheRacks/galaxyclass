import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../../src/rules/cards.js';
import {
  ACCUSE_MS,
  GAME_START_MS,
  PASS_BEAT_MS,
  ROLL_MS,
  SUGGEST_MS,
  TURN_LOCK_GRACE_MS,
  TURN_PASS_MS,
  UNREFUTED_MS,
} from '../../src/rules/constants.js';
import {
  accuse,
  canSuggest,
  chooseSuspect,
  dealCase,
  depart,
  emptyGame,
  endTurn,
  move,
  moveAnimationMs,
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
} from '../../src/rules/game.js';
import { seededRandom, type Random } from '../../src/rules/random.js';
import type { CardId, RoomId, SeatId, Solution } from '../../src/rules/types.js';

const T0 = 1_000_000;
const CAST = ['vesper', 'finch', 'juniper', 'rook', 'duarte', 'thorne'] as const;
const SOLUTION: Solution = { suspect: 'thorne', weapon: 'bust', room: 'parlor' };
const HANDS: Record<'1' | '2' | '3', CardId[]> = {
  '1': ['vesper', 'finch', 'telescope', 'vial', 'observatory', 'gallery'],
  '2': ['juniper', 'rook', 'saber', 'raygun', 'greenhouse', 'laboratory'],
  '3': ['duarte', 'trophy', 'music', 'theater', 'cellar', 'foyer'],
};

function must(result: RulesResult): Extract<RulesResult, { ok: true }> {
  if (!result.ok) throw new Error(result.code);
  return result;
}

/** The clock at the moment the next action opens. */
const at = (state: GameState): EventClock => ({ now: state.nextActionAt ?? T0, gameNumber: 1 });

/** A die that always shows `n`. */
const dice = (n: number): Random => ({ int: () => n - 1 });

function setup(seats: number): GameState {
  const picks: GameState['picks'] = {};
  for (let i = 0; i < seats; i++) picks[String(i + 1) as SeatId] = { suspect: CAST[i]!, ready: true };
  return { ...emptyGame(), picks };
}

const seatsOf = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1) as SeatId);

/** A three-detective case with a known case file and hands, seat 1 to play. */
function started(): GameState {
  const seated = seatsOf(3);
  const begun = must(startGame(setup(3), { seated, connected: seated, firstSeatId: '1' }, seededRandom(1), { now: T0, gameNumber: 1 }));
  return { ...begun.state, solution: SOLUTION, hands: { ...HANDS } };
}

/** Seat 1's token walked into `room` this turn. */
function enteredRoom(state: GameState, room: RoomId): GameState {
  return {
    ...state,
    positions: { ...state.positions, vesper: { kind: 'room', room } },
    turn: { ...state.turn!, phase: 'moved', dice: [3, 3], enteredRoom: room },
  };
}

describe('the deal', () => {
  it('draws one of each kind for the case file and deals every other card exactly once', () => {
    const deal = dealCase(seatsOf(4), seededRandom(9), '3');
    const dealt = Object.values(deal.hands).flat();
    expect(dealt).toHaveLength(18);
    expect(new Set([...dealt, deal.solution.suspect, deal.solution.weapon, deal.solution.room])).toEqual(new Set(ALL_CARDS));
    expect(['3', '4', '1', '2'].map((id) => deal.hands[id as SeatId]!.length)).toEqual([5, 5, 4, 4]);
    expect(new Set(Object.values(deal.weapons)).size).toBe(6);
  });

  it('splits evenly among three or six detectives', () => {
    expect(Object.values(dealCase(seatsOf(3), seededRandom(2)).hands).map((h) => h!.length)).toEqual([6, 6, 6]);
    expect(Object.values(dealCase(seatsOf(6), seededRandom(2)).hands).map((h) => h!.length)).toEqual([3, 3, 3, 3, 3, 3]);
  });

  it('is the same deal for the same seed, so a scripted case can be replayed', () => {
    expect(dealCase(seatsOf(3), seededRandom(77), '1')).toEqual(dealCase(seatsOf(3), seededRandom(77), '1'));
    const files = new Set(Array.from({ length: 40 }, (_, seed) => JSON.stringify(dealCase(seatsOf(3), seededRandom(seed + 1)).solution)));
    expect(files.size).toBeGreaterThan(20);
  });
});

describe('setup', () => {
  it('gives each suspect to one detective, and readies only those with one', () => {
    let state = emptyGame();
    state = must(chooseSuspect(state, '1', 'rook')).state;
    expect(chooseSuspect(state, '2', 'rook')).toEqual({ ok: false, code: 'suspect_taken' });
    expect(chooseSuspect(state, '2', 'the butler')).toEqual({ ok: false, code: 'invalid_suspect' });
    expect(setReady(state, '2', true)).toEqual({ ok: false, code: 'no_suspect' });
    state = must(setReady(state, '1', true)).state;
    expect(state.picks['1']).toEqual({ suspect: 'rook', ready: true });
    state = must(chooseSuspect(state, '1', 'finch')).state;
    expect(state.picks['1']).toEqual({ suspect: 'finch', ready: false });
    expect(must(chooseSuspect(state, '2', 'rook')).state.picks['2']!.suspect).toBe('rook');
    expect(withdrawPick(state, '1').picks).toEqual({});
  });

  it('needs three detectives, every one picked, ready, and connected', () => {
    const clock = { now: T0, gameNumber: 1 };
    expect(startGame(setup(2), { seated: seatsOf(2), connected: seatsOf(2) }, seededRandom(1), clock)).toEqual({
      ok: false,
      code: 'not_enough_players',
    });
    expect(startGame(setup(3), { seated: seatsOf(3), connected: ['1', '2'] }, seededRandom(1), clock)).toEqual({
      ok: false,
      code: 'players_not_ready',
    });
    const notReady = { ...setup(3), picks: { ...setup(3).picks, '2': { suspect: 'finch' as const, ready: false } } };
    expect(startGame(notReady, { seated: seatsOf(3), connected: seatsOf(3) }, seededRandom(1), clock)).toMatchObject({
      code: 'players_not_ready',
    });
  });

  it('opens the case with the first turn, every token home, and the weapons scattered', () => {
    const seated = seatsOf(4);
    const result = must(startGame(setup(4), { seated, connected: seated, firstSeatId: '3' }, seededRandom(5), { now: T0, gameNumber: 2 }));
    expect(result.state).toMatchObject({
      status: 'playing',
      players: ['1', '2', '3', '4'],
      currentSeatId: '3',
      turnNumber: 1,
      nextActionAt: T0 + GAME_START_MS - TURN_LOCK_GRACE_MS,
      turn: { phase: 'start', dice: null, startRoom: null },
    });
    expect(result.events).toEqual([
      {
        kind: 'game_started',
        firstSeatId: '3',
        weapons: result.state.weapons,
        eventId: '2-1',
        gameNumber: 2,
        seq: 1,
        serverTs: T0,
        delayMs: 0,
        animationMs: GAME_START_MS,
      },
    ]);
    expect(result.state.log).toEqual(result.events);
    expect(result.state.positions.vesper).toEqual({ kind: 'hall', x: 7, y: 0 });
  });

  it('deals with a separate source when given one, so the dice can stay random', () => {
    const seated = seatsOf(3);
    const clock = { now: T0, gameNumber: 1 };
    const a = must(startGame(setup(3), { seated, connected: seated, firstSeatId: '1' }, seededRandom(1), clock, seededRandom(99)));
    const b = must(startGame(setup(3), { seated, connected: seated, firstSeatId: '1' }, seededRandom(2), clock, seededRandom(99)));
    expect(a.state.solution).toEqual(b.state.solution);
    expect(a.state.solution).toEqual(dealCase(seated, seededRandom(99), '1').solution);
  });

  it('goes back to setup after a case with the same suspects and nobody ready', () => {
    const over = must(accuse(started(), '1', SOLUTION, at(started()))).state;
    expect(over.status).toBe('finished');
    expect(newCase(started(), seatsOf(3))).toEqual({ ok: false, code: 'not_finished' });
    const next = must(newCase(over, ['1', '3'])).state;
    expect(next).toMatchObject({ status: 'setup', players: [], solution: null, log: [], hands: {} });
    expect(next.picks).toEqual({ '1': { suspect: 'vesper', ready: false }, '3': { suspect: 'juniper', ready: false } });
  });
});

describe('a turn', () => {
  it('rolls two dice, then walks the token up to the total', () => {
    const state = started();
    const rolled = must(roll(state, '1', dice(4), at(state)));
    expect(rolled.state.turn).toMatchObject({ phase: 'moving', dice: [4, 4] });
    expect(rolled.events[0]).toMatchObject({ kind: 'rolled', seatId: '1', dice: [4, 4], animationMs: ROLL_MS });
    expect(roll(rolled.state, '1', dice(4), at(rolled.state))).toEqual({ ok: false, code: 'wrong_phase' });

    const far = { kind: 'hall' as const, x: 7, y: 9 };
    expect(move(rolled.state, '1', far, at(rolled.state))).toEqual({ ok: false, code: 'unreachable' });
    const moved = must(move(rolled.state, '1', { kind: 'room', room: 'gallery' }, at(rolled.state)));
    expect(moved.state.positions.vesper).toEqual({ kind: 'room', room: 'gallery' });
    expect(moved.state.turn).toMatchObject({ phase: 'moved', enteredRoom: 'gallery' });
    const event = moved.events[0]!;
    expect(event).toMatchObject({ kind: 'moved', seatId: '1', suspect: 'vesper', via: 'walk' });
    expect(event.kind === 'moved' && event.path).toHaveLength(6);
    expect(event.animationMs).toBe(moveAnimationMs(5));
  });

  it('holds every action until the last one has played', () => {
    const state = started();
    expect(roll(state, '1', dice(3), { now: state.nextActionAt! - 1, gameNumber: 1 })).toEqual({ ok: false, code: 'turn_not_open' });
    expect(roll(state, '2', dice(3), at(state))).toEqual({ ok: false, code: 'not_your_turn' });
    const rolled = must(roll(state, '1', dice(3), at(state))).state;
    expect(rolled.nextActionAt).toBe(state.nextActionAt! + ROLL_MS - TURN_LOCK_GRACE_MS);
  });

  it('takes a secret passage from a corner room instead of rolling', () => {
    const state = started();
    expect(takePassage(state, '1', at(state))).toEqual({ ok: false, code: 'no_passage' });
    const inCorner = { ...state, positions: { ...state.positions, vesper: { kind: 'room' as const, room: 'observatory' as const } } };
    const through = must(takePassage(inCorner, '1', at(inCorner)));
    expect(through.state.positions.vesper).toEqual({ kind: 'room', room: 'parlor' });
    expect(through.state.turn).toMatchObject({ phase: 'moved', enteredRoom: 'parlor' });
    expect(through.events[0]).toMatchObject({ kind: 'moved', via: 'passage' });
    expect(canSuggest(through.state, '1')).toBe(true);
  });

  it('passes the turn clockwise, wrapping around', () => {
    let state = started();
    for (const [seat, next] of [['1', '2'], ['2', '3'], ['3', '1']] as const) {
      const passed = must(endTurn(state, seat, at(state)));
      expect(passed.events[0]).toMatchObject({ kind: 'turn_passed', seatId: seat, nextSeatId: next, animationMs: TURN_PASS_MS });
      state = passed.state;
      expect(state.currentSeatId).toBe(next);
    }
    expect(state.turnNumber).toBe(4);
  });
});

describe('suggestions', () => {
  it('can only be made in a room entered this turn', () => {
    const state = started();
    expect(canSuggest(state, '1')).toBe(false);
    expect(suggest(state, '1', 'rook', 'saber', at(state))).toEqual({ ok: false, code: 'cannot_suggest' });
    const inRoom = enteredRoom(state, 'cellar');
    expect(suggest(inRoom, '1', 'nobody', 'saber', at(inRoom))).toEqual({ ok: false, code: 'invalid_suspect' });
    expect(suggest(inRoom, '1', 'rook', 'spoon', at(inRoom))).toEqual({ ok: false, code: 'invalid_weapon' });
  });

  it('pulls the suspect and weapon in, and asks clockwise until someone can refute', () => {
    const state = enteredRoom(started(), 'cellar');
    const result = must(suggest(state, '1', 'finch', 'saber', at(state)));
    // Seat 2 holds the saber; seat 3 is never asked.
    expect(result.events[0]).toMatchObject({
      kind: 'suggested',
      seatId: '1',
      suspect: 'finch',
      weapon: 'saber',
      room: 'cellar',
      suspectFrom: { kind: 'hall', x: 16, y: 0 },
      pulledSeatId: '2',
      passed: [],
      refuterSeatId: '2',
      animationMs: SUGGEST_MS,
    });
    expect(result.state.positions.finch).toEqual({ kind: 'room', room: 'cellar' });
    expect(result.state.weapons!.saber).toBe('cellar');
    expect(result.state.pulledIn).toEqual(['2']);
    expect(result.state.turn).toMatchObject({ phase: 'refuting', refuterSeatId: '2', suggestion: { suspect: 'finch', weapon: 'saber', room: 'cellar' } });
  });

  it('records each detective who could not refute, and goes unrefuted when nobody can', () => {
    const state = enteredRoom(started(), 'parlor');
    const passOne = must(suggest(state, '1', 'duarte', 'bust', at(state)));
    expect(passOne.events[0]).toMatchObject({ passed: ['2'], refuterSeatId: '3', animationMs: SUGGEST_MS + PASS_BEAT_MS });

    const none = must(suggest(state, '1', 'thorne', 'bust', at(state)));
    expect(none.events[0]).toMatchObject({
      passed: ['2', '3'],
      refuterSeatId: null,
      pulledSeatId: null,
      animationMs: SUGGEST_MS + 2 * PASS_BEAT_MS + UNREFUTED_MS,
    });
    expect(none.state.turn).toMatchObject({ phase: 'suggested', refuterSeatId: null });
  });

  it('lets the refuter show only a matching card, then settles the suggestion', () => {
    const state = enteredRoom(started(), 'cellar');
    const asked = must(suggest(state, '1', 'finch', 'saber', at(state))).state;
    expect(showCard(asked, '3', 'duarte', at(asked))).toEqual({ ok: false, code: 'not_refuter' });
    expect(showCard(asked, '2', 'juniper', at(asked))).toEqual({ ok: false, code: 'cannot_show' });
    expect(showCard(asked, '2', 'ace', at(asked))).toEqual({ ok: false, code: 'invalid_card' });
    expect(endTurn(asked, '1', at(asked))).toEqual({ ok: false, code: 'wrong_phase' });
    expect(accuse(asked, '1', SOLUTION, at(asked))).toEqual({ ok: false, code: 'wrong_phase' });

    const shown = must(showCard(asked, '2', 'saber', at(asked)));
    expect(shown.events[0]).toMatchObject({ kind: 'refuted', suggesterSeatId: '1', refuterSeatId: '2', card: 'saber' });
    expect(shown.state.turn).toMatchObject({ phase: 'suggested', refuterSeatId: null });
    expect(suggest(shown.state, '1', 'rook', 'vial', at(shown.state))).toEqual({ ok: false, code: 'cannot_suggest' });
  });

  it('lets a detective pulled into a room suggest there at the start of their next turn', () => {
    const state = enteredRoom(started(), 'cellar');
    const asked = must(suggest(state, '1', 'finch', 'saber', at(state))).state;
    const shown = must(showCard(asked, '2', 'saber', at(asked))).state;
    const theirs = must(endTurn(shown, '1', at(shown))).state;
    expect(theirs.turn).toMatchObject({ phase: 'start', startRoom: 'cellar' });
    expect(canSuggest(theirs, '2')).toBe(true);
    const again = must(suggest(theirs, '2', 'vesper', 'trophy', at(theirs)));
    expect(again.events[0]).toMatchObject({ room: 'cellar', refuterSeatId: '3' });

    const passed = must(endTurn(theirs, '2', at(theirs))).state;
    expect(passed.pulledIn).toEqual([]);
  });

  it('does not count a suspect already standing in the room as pulled in', () => {
    const state = enteredRoom(started(), 'cellar');
    const already = { ...state, positions: { ...state.positions, finch: { kind: 'room' as const, room: 'cellar' as const } } };
    expect(must(suggest(already, '1', 'finch', 'vial', at(already))).state.pulledIn).toEqual([]);
  });
});

describe('accusations', () => {
  it('wins the case when right', () => {
    const state = started();
    const result = must(accuse(state, '1', SOLUTION, at(state)));
    expect(result.events.map((e) => e.kind)).toEqual(['accused', 'game_over']);
    expect(result.events[0]).toMatchObject({ correct: true, animationMs: ACCUSE_MS });
    expect(result.events[1]).toMatchObject({ winnerSeatId: '1', reason: 'solved', solution: SOLUTION, delayMs: ACCUSE_MS });
    expect(result.state).toMatchObject({ status: 'finished', winnerSeatId: '1', endReason: 'solved', currentSeatId: null, nextActionAt: null });
  });

  it('takes a wrong accuser out of the running, though they still refute', () => {
    const state = started();
    expect(accuse(state, '1', { ...SOLUTION, room: 'kitchen' }, at(state))).toEqual({ ok: false, code: 'invalid_room' });
    const wrong = must(accuse(state, '1', { ...SOLUTION, room: 'cellar' }, at(state)));
    expect(wrong.events.map((e) => e.kind)).toEqual(['accused', 'turn_passed']);
    expect(wrong.events[0]).toMatchObject({ correct: false });
    expect(wrong.state).toMatchObject({ status: 'playing', eliminated: ['1'], currentSeatId: '2' });

    // Seat 3 never gets back to seat 1's turn, and seat 1 still answers suggestions.
    const third = must(endTurn(wrong.state, '2', at(wrong.state))).state;
    const around = must(endTurn(third, '3', at(third))).state;
    expect(around.currentSeatId).toBe('2');
    const s3 = { ...third, positions: { ...third.positions, juniper: { kind: 'room' as const, room: 'cellar' as const } }, turn: { ...third.turn!, phase: 'moved' as const, enteredRoom: 'cellar' as const } };
    const asked = must(suggest(s3, '3', 'vesper', 'saber', at(s3)));
    expect(asked.events[0]).toMatchObject({ passed: [], refuterSeatId: '1' });
    expect(roll(around, '1', dice(1), at(around))).toEqual({ ok: false, code: 'eliminated' });
  });

  it('closes the case unsolved when every detective has accused wrongly', () => {
    let state = started();
    for (const seat of ['1', '2'] as const) state = must(accuse(state, seat, { ...SOLUTION, weapon: 'vial' }, at(state))).state;
    const last = must(accuse(state, '3', { ...SOLUTION, weapon: 'vial' }, at(state)));
    expect(last.events.map((e) => e.kind)).toEqual(['accused', 'game_over']);
    expect(last.state).toMatchObject({ status: 'finished', endReason: 'unsolved', winnerSeatId: null });
  });
});

describe('leaving mid-case', () => {
  it('lays the cards face up and passes the turn when it was theirs', () => {
    const state = { ...started(), players: ['1', '2', '3', '4'] as SeatId[], hands: { ...HANDS, '4': [] } };
    const gone = must(depart(state, '1', 'left', { now: T0, gameNumber: 1 }));
    expect(gone.events.map((e) => e.kind)).toEqual(['departed', 'turn_passed']);
    expect(gone.events[0]).toMatchObject({ seatId: '1', reason: 'left', revealed: HANDS['1'] });
    expect(gone.state).toMatchObject({ departed: ['1'], eliminated: ['1'], currentSeatId: '2', revealedCards: HANDS['1'] });
  });

  it('hands a pending refutation to the next detective who can answer', () => {
    const state = enteredRoom(started(), 'parlor');
    const asked = must(suggest(state, '1', 'finch', 'saber', at(state))).state;
    const four = { ...asked, players: ['1', '2', '3', '4'] as SeatId[], hands: { ...asked.hands, '4': ['finch'] as CardId[] } };
    const gone = must(depart(four, '2', 'abandoned', at(four)));
    expect(gone.state.turn).toMatchObject({ phase: 'refuting', refuterSeatId: '4', passed: ['3'] });
    expect(gone.state.currentSeatId).toBe('1');
  });

  it('ends the case when fewer than two detectives are left', () => {
    const state = started();
    const one = must(depart(state, '2', 'left', at(state))).state;
    expect(one.status).toBe('playing');
    const two = must(depart(one, ['1', '3'], 'abandoned', at(one)));
    expect(two.events.map((e) => e.kind)).toEqual(['departed', 'game_over']);
    expect(two.state).toMatchObject({ status: 'finished', endReason: 'abandoned', winnerSeatId: null });
    expect(depart(two.state, '3', 'left', at(two.state))).toEqual({ ok: false, code: 'not_playing' });
  });
});
