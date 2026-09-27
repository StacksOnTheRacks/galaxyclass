import { describe, expect, it } from 'vitest';
import { advanceStreet, applyAction } from '../../src/rules/index.js';
import {
  act,
  advance,
  checkDownStreet,
  completePreflopHu,
  completePreflopThreeSeat,
  mustDeal,
  snapshotState,
  threeSeatDealConfig,
} from './helpers.js';

describe('advanceStreet', () => {
  it('deals flop, turn, and river with one burn before each street', () => {
    let state = mustDeal(threeSeatDealConfig());
    state = completePreflopThreeSeat(state);
    state = advance(state);
    expect(state.board).toHaveLength(3);
    expect(state.burns).toHaveLength(1);

    state = checkDownStreet(state);
    state = advance(state);
    expect(state.board).toHaveLength(4);
    expect(state.burns).toHaveLength(2);

    state = checkDownStreet(state);
    state = advance(state);
    expect(state.board).toHaveLength(5);
    expect(state.burns).toHaveLength(3);
    expect(state.street).toBe('river');
  });

  it('rejects advance before betting is complete without mutating board', () => {
    const state = mustDeal(threeSeatDealConfig());
    const before = snapshotState(state);
    const result = advanceStreet(state);
    expect(result.ok).toBe(false);
    expect(snapshotState(state)).toBe(before);
    expect(state.board).toHaveLength(0);
  });

  it('hole cards and board stay disjoint', () => {
    let state = mustDeal(threeSeatDealConfig());
    state = completePreflopThreeSeat(state);
    state = advance(state);
    const holes = state.seats.flatMap((s) => [s.hole[0], s.hole[1]]);
    for (const card of [...state.board, ...state.burns]) {
      expect(holes).not.toContain(card);
    }
  });

  it('heads-up completes preflop and deals flop', () => {
    let state = mustDeal();
    state = completePreflopHu(state);
    state = advance(state);
    expect(state.board).toHaveLength(3);
  });

  it('same seed yields same board after advance', () => {
    let a = mustDeal(threeSeatDealConfig(5));
    a = completePreflopThreeSeat(a);
    a = advance(a);

    let b = mustDeal(threeSeatDealConfig(5));
    b = completePreflopThreeSeat(b);
    b = advance(b);

    expect(a.board).toEqual(b.board);
  });
});

describe('river betting complete does not advance board further', () => {
  it('sets showdown_ready after river checks', () => {
    let state = mustDeal(threeSeatDealConfig());
    state = completePreflopThreeSeat(state);
    state = advance(state);
    state = checkDownStreet(state);
    state = advance(state);
    state = checkDownStreet(state);
    state = advance(state);
    state = checkDownStreet(state);
    expect(state.phase).toBe('showdown_ready');
    expect(state.board).toHaveLength(5);
    const result = advanceStreet(state);
    expect(result.ok).toBe(false);
  });
});

void act;
void applyAction;
