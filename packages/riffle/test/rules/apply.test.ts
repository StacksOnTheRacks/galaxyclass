import { describe, expect, it } from 'vitest';
import { applyAction, legalize } from '../../src/rules/index.js';
import {
  act,
  assertStateUnchanged,
  completePreflopThreeSeat,
  FIXTURE_BB,
  mustDeal,
  rejectAct,
  snapshotState,
  threeSeatDealConfig,
} from './helpers.js';

describe('applyAction', () => {
  it('updates stack and pot on legal call preflop', () => {
    const state = mustDeal(threeSeatDealConfig());
    const beforeStack = state.seats.find((s) => s.seatId === 's0')!.stack;
    const beforePot = state.pot;
    const next = act(state, 's0', { type: 'call' });
    const afterSeat = next.seats.find((s) => s.seatId === 's0')!;
    expect(afterSeat.stack).toBe(beforeStack - FIXTURE_BB);
    expect(next.pot).toBe(beforePot + FIXTURE_BB);
  });

  it('accepts legal raise-to 300 and rejects 150', () => {
    const state = mustDeal(threeSeatDealConfig());
    expect(act(state, 's0', { type: 'raise', amount: 300 }).currentBet).toBe(300);
    expect(rejectAct(state, 's0', { type: 'raise', amount: 150 }).ok).toBe(false);
  });

  it('does not mutate caller state on reject', () => {
    const state = mustDeal(threeSeatDealConfig());
    const before = snapshotState(state);
    rejectAct(state, 's1', { type: 'fold' });
    expect(snapshotState(state)).toBe(before);
  });
});

describe('legalize integration', () => {
  it('legalize leaves state unchanged on reject', () => {
    const state = mustDeal(threeSeatDealConfig());
    const snap = snapshotState(state);
    legalize(state, 's1', { type: 'fold' });
    assertStateUnchanged(JSON.parse(snap), state);
  });

  it('rejects unknown action shapes via illegal_action', () => {
    const state = mustDeal(threeSeatDealConfig());
    // @ts-expect-error intentional bad action
    expect(rejectAct(state, 's0', { type: 'allin' }).error?.code).toBe('illegal_action');
  });

  it('rejects zero/negative bet amounts', () => {
    const state = mustDeal(threeSeatDealConfig());
    expect(rejectAct(state, 's0', { type: 'raise', amount: 0 }).ok).toBe(false);
  });
});

describe('preflop completion', () => {
  it('three-seat call chain reaches street_complete', () => {
    const state = completePreflopThreeSeat(mustDeal(threeSeatDealConfig()));
    expect(state.phase).toBe('street_complete');
  });
});

describe('fold-to-one via apply', () => {
  it('sets fold_to_one when all but one fold', () => {
    let state = mustDeal(threeSeatDealConfig());
    state = applyAction(state, 's0', { type: 'fold' }).value!;
    state = applyAction(state, 's1', { type: 'fold' }).value!;
    expect(state.phase).toBe('fold_to_one');
  });
});
