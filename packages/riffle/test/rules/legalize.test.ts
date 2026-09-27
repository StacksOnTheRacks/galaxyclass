import { describe, expect, it } from 'vitest';
import { legalize } from '../../src/rules/index.js';
import {
  assertStateUnchanged,
  completePreflopThreeSeat,
  FIXTURE_BB,
  mustDeal,
  snapshotState,
  threeSeatDealConfig,
} from './helpers.js';
import { advanceStreet, applyAction } from '../../src/rules/index.js';

describe('legalize', () => {
  it('allows on-turn fold/call/raise facing posted BB preflop', () => {
    const state = mustDeal(threeSeatDealConfig());
    expect(legalize(state, 's0', { type: 'fold' }).ok).toBe(true);
    expect(legalize(state, 's0', { type: 'call' }).ok).toBe(true);
    expect(legalize(state, 's0', { type: 'raise', amount: 200 }).ok).toBe(true);
    expect(legalize(state, 's0', { type: 'raise', amount: 300 }).ok).toBe(true);
  });

  it('rejects raise-to below minimum (150 vs min 200)', () => {
    const state = mustDeal(threeSeatDealConfig());
    const result = legalize(state, 's0', { type: 'raise', amount: 150 });
    expect(result.ok).toBe(false);
  });

  it('rejects off-turn with off_turn and no mutation', () => {
    const state = mustDeal(threeSeatDealConfig());
    const snap = snapshotState(state);
    const result = legalize(state, 's1', { type: 'fold' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('off_turn');
    }
    assertStateUnchanged(JSON.parse(snap), state);
  });

  it('rejects check facing a bet', () => {
    const state = mustDeal(threeSeatDealConfig());
    expect(legalize(state, 's0', { type: 'check' }).ok).toBe(false);
  });

  it('rejects bet facing a bet preflop', () => {
    const state = mustDeal(threeSeatDealConfig());
    expect(legalize(state, 's0', { type: 'bet', amount: FIXTURE_BB }).ok).toBe(false);
  });

  it('allows check/bet when not facing a bet postflop', () => {
    let state = mustDeal(threeSeatDealConfig());
    state = completePreflopThreeSeat(state);
    const advanced = advanceStreet(state);
    expect(advanced.ok).toBe(true);
    if (!advanced.ok) {
      return;
    }
    state = advanced.value;
    expect(legalize(state, state.currentSeatId!, { type: 'check' }).ok).toBe(true);
    expect(legalize(state, state.currentSeatId!, { type: 'bet', amount: FIXTURE_BB }).ok).toBe(
      true,
    );
  });

  it('rejects call/raise with nothing to call postflop', () => {
    let state = mustDeal(threeSeatDealConfig());
    state = completePreflopThreeSeat(state);
    const advanced = advanceStreet(state);
    if (!advanced.ok) {
      throw new Error(advanced.error.message);
    }
    state = advanced.value;
    expect(legalize(state, state.currentSeatId!, { type: 'call' }).ok).toBe(false);
    expect(legalize(state, state.currentSeatId!, { type: 'raise', amount: 200 }).ok).toBe(false);
  });

  it('rejects all-in or side pot call facing a bet', () => {
    const state = mustDeal(threeSeatDealConfig());
    const short = {
      ...state,
      currentBet: 300,
      seats: state.seats.map((seat) =>
        seat.seatId === 's2'
          ? { ...seat, stack: 200, streetCommitted: 100 }
          : seat,
      ),
      currentSeatId: 's2',
    };
    const result = legalize(short, 's2', { type: 'call' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('all_in_or_side_pot_unsupported');
    }
  });

  it('rejects action after fold_to_one phase', () => {
    let state = mustDeal(threeSeatDealConfig());
    state = applyAction(state, 's0', { type: 'fold' }).value!;
    state = applyAction(state, 's1', { type: 'fold' }).value!;
    expect(state.phase).toBe('fold_to_one');
    const result = legalize(state, 's2', { type: 'check' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('illegal_action');
    }
  });
});
