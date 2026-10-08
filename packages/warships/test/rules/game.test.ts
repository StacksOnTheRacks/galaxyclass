import { describe, expect, it } from 'vitest';
import {
  BATTLE_START_MS,
  FLEET_CELL_COUNT,
  SHOT_ANIMATION_MS,
  SINK_ANNOUNCE_MS,
  TURN_LOCK_GRACE_MS,
} from '../../src/rules/constants.js';
import {
  abandonPlacing,
  beginPlacing,
  concede,
  emptyGame,
  fire,
  placeFleet,
  shotAnimationMs,
  unready,
  voteRematch,
  withdrawRematchVote,
  type GameState,
} from '../../src/rules/game.js';
import type { Coord, SeatId } from '../../src/rules/types.js';
import { A_FLEET, B_FLEET, cellsOf, waterOf } from '../support/fleets.js';

const T0 = 1_000_000;

function placing(first: SeatId = '1'): GameState {
  return beginPlacing(emptyGame(), ['1', '2'], first);
}

function inBattle(first: SeatId = '1'): GameState {
  const a = placeFleet(placing(first), '1', A_FLEET, { now: T0 });
  if (!a.ok) throw new Error(a.code);
  const b = placeFleet(a.state, '2', B_FLEET, { now: T0 });
  if (!b.ok) throw new Error(b.code);
  return b.state;
}

function shoot(state: GameState, seatId: SeatId, target: Coord, now = state.turnOpensAt ?? T0) {
  const result = fire(state, seatId, target, { now, gameNumber: 1 });
  if (!result.ok) throw new Error(result.code);
  return result;
}

describe('placing', () => {
  it('opens with empty boards for both seats', () => {
    const state = placing('2');
    expect(state).toMatchObject({
      status: 'placing',
      players: ['1', '2'],
      firstSeatId: '2',
      currentSeatId: null,
      turnNumber: 0,
      history: [],
      boards: { '1': { fleet: null, ready: false }, '2': { fleet: null, ready: false } },
    });
  });

  it('readies a captain with their fleet and starts battle when the second fleet goes ready', () => {
    const one = placeFleet(placing('2'), '1', [...A_FLEET].reverse(), { now: T0 });
    expect(one.ok && one.state.status).toBe('placing');
    expect(one.ok && one.state.boards['1']).toEqual({ fleet: A_FLEET, ready: true });

    const two = placeFleet(one.ok ? one.state : placing(), '2', B_FLEET, { now: T0 + 50 });
    expect(two.ok && two.state).toMatchObject({
      status: 'battle',
      currentSeatId: '2',
      turnNumber: 0,
      turnOpensAt: T0 + 50 + BATTLE_START_MS,
    });
  });

  it('refuses a bad fleet with the reason, and placing outside placement', () => {
    expect(placeFleet(placing(), '1', A_FLEET.slice(1), { now: T0 })).toEqual({
      ok: false,
      code: 'invalid_fleet',
      reason: 'wrong_ships',
    });
    expect(placeFleet(emptyGame(), '1', A_FLEET, { now: T0 })).toEqual({ ok: false, code: 'not_placing' });
    expect(placeFleet(inBattle(), '1', A_FLEET, { now: T0 })).toEqual({ ok: false, code: 'not_placing' });
  });

  it('lets a captain unready, keeping their fleet, only while the other is not ready', () => {
    const one = placeFleet(placing(), '1', A_FLEET, { now: T0 });
    if (!one.ok) throw new Error('setup');
    const back = unready(one.state, '1');
    expect(back.ok && back.state.boards['1']).toEqual({ fleet: A_FLEET, ready: false });

    const other = placeFleet(placing(), '2', B_FLEET, { now: T0 });
    if (!other.ok) throw new Error('setup');
    expect(unready(other.state, '1')).toEqual({ ok: false, code: 'not_placing' });
    expect(unready(inBattle(), '1')).toEqual({ ok: false, code: 'not_placing' });
  });
});

describe('battle', () => {
  it('resolves a miss and always passes the turn', () => {
    const state = inBattle();
    const target = waterOf(B_FLEET)[0]!;
    const { state: next, shot } = shoot(state, '1', target);
    expect(shot).toEqual({
      shotId: '1-1',
      gameNumber: 1,
      turnNumber: 1,
      shooter: '1',
      target: '2',
      coord: target,
      result: 'miss',
      gameOver: false,
      serverTs: state.turnOpensAt,
      animationMs: SHOT_ANIMATION_MS,
    });
    expect(next).toMatchObject({ currentSeatId: '2', turnNumber: 1 });
    expect(next.turnOpensAt).toBe(state.turnOpensAt! + SHOT_ANIMATION_MS - TURN_LOCK_GRACE_MS);
  });

  it('passes the turn after a hit too', () => {
    const { state, shot } = shoot(inBattle(), '1', cellsOf(B_FLEET, 'carrier')[0]!);
    expect(shot.result).toBe('hit');
    expect(shot.sunkShip).toBeUndefined();
    expect(state.currentSeatId).toBe('2');
  });

  it('announces a sinking with the ship’s placement and a longer animation', () => {
    let state = inBattle();
    const [first, second] = cellsOf(B_FLEET, 'destroyer');
    state = shoot(state, '1', first!).state;
    state = shoot(state, '2', waterOf(A_FLEET)[0]!).state;
    const { state: next, shot } = shoot(state, '1', second!);
    expect(shot.sunkShip).toEqual({ shipId: 'destroyer', row: 8, col: 1, orientation: 'vertical', length: 2, sunkOnTurn: 3 });
    expect(shot.animationMs).toBe(SHOT_ANIMATION_MS + SINK_ANNOUNCE_MS);
    expect(next.turnOpensAt).toBe(shot.serverTs + SHOT_ANIMATION_MS + SINK_ANNOUNCE_MS - TURN_LOCK_GRACE_MS);
  });

  it('holds the next turn until the animation has nearly played', () => {
    const { state } = shoot(inBattle(), '1', waterOf(B_FLEET)[0]!);
    const early = fire(state, '2', waterOf(A_FLEET)[0]!, { now: state.turnOpensAt! - 1, gameNumber: 1 });
    expect(early).toEqual({ ok: false, code: 'turn_not_open' });
    expect(fire(state, '2', waterOf(A_FLEET)[0]!, { now: state.turnOpensAt!, gameNumber: 1 }).ok).toBe(true);

    const opening = inBattle();
    expect(fire(opening, '1', { row: 0, col: 0 }, { now: T0 + BATTLE_START_MS - 1, gameNumber: 1 })).toEqual({
      ok: false,
      code: 'turn_not_open',
    });
  });

  it('refuses out-of-turn, off-board, repeated, and out-of-battle shots', () => {
    const state = inBattle();
    const now = state.turnOpensAt!;
    expect(fire(state, '2', { row: 0, col: 0 }, { now, gameNumber: 1 })).toEqual({ ok: false, code: 'not_your_turn' });
    expect(fire(state, '1', { row: 10, col: 0 }, { now, gameNumber: 1 })).toEqual({ ok: false, code: 'invalid_target' });
    expect(fire(state, '1', { row: 0.5, col: 0 }, { now, gameNumber: 1 })).toEqual({ ok: false, code: 'invalid_target' });
    expect(fire(placing(), '1', { row: 0, col: 0 }, { now, gameNumber: 1 })).toEqual({ ok: false, code: 'not_in_battle' });

    let next = shoot(state, '1', { row: 4, col: 4 }).state;
    next = shoot(next, '2', { row: 4, col: 4 }).state;
    expect(fire(next, '1', { row: 4, col: 4 }, { now: next.turnOpensAt!, gameNumber: 1 })).toEqual({
      ok: false,
      code: 'already_fired',
    });
  });

  it('finishes when the last ship goes down, with the shooter as winner', () => {
    let state = inBattle();
    const targets = cellsOf(B_FLEET);
    const decoys = waterOf(A_FLEET);
    let last;
    for (let i = 0; i < targets.length; i++) {
      last = shoot(state, '1', targets[i]!);
      state = last.state;
      if (state.status === 'finished') break;
      state = shoot(state, '2', decoys[i]!).state;
    }
    expect(last!.shot).toMatchObject({ gameOver: true, result: 'hit', turnNumber: FLEET_CELL_COUNT * 2 - 1 });
    expect(last!.shot.sunkShip?.shipId).toBe('destroyer');
    expect(state).toMatchObject({
      status: 'finished',
      winnerSeatId: '1',
      endReason: 'fleet_sunk',
      currentSeatId: null,
      turnOpensAt: null,
    });
  });
});

describe('endings and rematch', () => {
  it('concedes in placing or battle, and nowhere else', () => {
    expect(concede(inBattle(), '1', 'forfeit')).toMatchObject({
      ok: true,
      state: { status: 'finished', winnerSeatId: '2', endReason: 'forfeit', currentSeatId: null },
    });
    expect(concede(placing(), '2', 'abandoned')).toMatchObject({
      ok: true,
      state: { status: 'finished', winnerSeatId: '1', endReason: 'abandoned' },
    });
    expect(concede(emptyGame(), '1', 'forfeit')).toEqual({ ok: false, code: 'not_in_battle' });
  });

  it('starts a rematch when both have voted, with the loser firing first', () => {
    const over = concede(inBattle('1'), '2', 'forfeit');
    if (!over.ok) throw new Error('setup');
    const one = voteRematch(over.state, '1');
    expect(one.ok && one.state).toMatchObject({ status: 'finished', rematchVotes: ['1'] });
    const again = voteRematch(one.ok ? one.state : over.state, '1');
    expect(again.ok && again.state.rematchVotes).toEqual(['1']);
    const both = voteRematch(one.ok ? one.state : over.state, '2');
    expect(both.ok && both.state).toMatchObject({
      status: 'placing',
      firstSeatId: '2',
      history: [],
      rematchVotes: [],
      winnerSeatId: null,
      boards: { '1': { fleet: null, ready: false }, '2': { fleet: null, ready: false } },
    });
    expect(voteRematch(inBattle(), '1')).toEqual({ ok: false, code: 'not_finished' });
  });

  it('drops a vote when its seat goes', () => {
    const over = concede(inBattle(), '2', 'forfeit');
    const voted = over.ok ? voteRematch(over.state, '1') : over;
    if (!voted.ok) throw new Error('setup');
    expect(withdrawRematchVote(voted.state, '1').rematchVotes).toEqual([]);
  });

  it('sends an abandoned placement back to waiting with both boards cleared', () => {
    const one = placeFleet(placing(), '1', A_FLEET, { now: T0 });
    expect(abandonPlacing(one.ok ? one.state : placing())).toEqual(emptyGame());
  });

  it('times a shot, plus the sink announcement', () => {
    expect(shotAnimationMs(false)).toBe(2200);
    expect(shotAnimationMs(true)).toBe(3800);
  });
});
