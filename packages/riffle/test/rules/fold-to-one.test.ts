import { describe, expect, it } from 'vitest';
import { applyAction, completeFoldToOne } from '../../src/rules/index.js';
import {
  act,
  completePreflopThreeSeat,
  mustDeal,
  threeSeatDealConfig,
} from './helpers.js';

describe('fold-to-one', () => {
  it('heads-up: one fold awards pot without ranking', () => {
    let state = mustDeal();
    const winnerId = state.currentSeatId!;
    state = act(state, winnerId, { type: 'fold' });
    expect(state.phase).toBe('fold_to_one');

    const remaining = state.seats.find((s) => !s.folded)!;
    const potBefore = state.pot;
    const stackBefore = remaining.stack;

    const completed = completeFoldToOne(state);
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }

    expect(completed.value.completeReason).toBe('fold_to_one');
    expect(completed.value.winners).toHaveLength(1);
    expect(completed.value.winners![0].rankName).toBeUndefined();
    expect(completed.value.pot).toBe(0);
    expect(completed.value.seats.find((s) => s.seatId === remaining.seatId)!.stack).toBe(
      stackBefore + potBefore,
    );
  });

  it('three-seat: all but one fold moves pot to remaining seat', () => {
    let state = mustDeal(threeSeatDealConfig());
    state = act(state, 's0', { type: 'fold' });
    state = act(state, 's1', { type: 'fold' });
    expect(state.phase).toBe('fold_to_one');

    const bb = state.seats.find((s) => s.seatId === 's2')!;
    const pot = state.pot;
    const completed = completeFoldToOne(state);
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }
    expect(completed.value.seats.find((s) => s.seatId === 's2')!.stack).toBe(bb.stack + pot);
    expect(completed.value.phase).toBe('complete');
  });

  it('does not rank hands on fold-to-one', () => {
    let state = mustDeal(threeSeatDealConfig());
    state = applyAction(state, 's0', { type: 'fold' }).value!;
    state = applyAction(state, 's1', { type: 'fold' }).value!;
    const done = completeFoldToOne(state);
    expect(done.ok).toBe(true);
    if (done.ok) {
      expect(done.value.winners?.every((w) => w.rankName === undefined)).toBe(true);
    }
  });
});
