import { describe, expect, it, vi } from 'vitest';
import {
  applyAction,
  buildSidePots,
  createSeededRng,
  dealHand,
  finalizeTerminalHand,
  legalize,
  returnUncalledChips,
} from '../../src/rules/index.js';
import type { HandState } from '../../src/rules/types.js';

describe('all-in rules with allowAllIn', () => {
  it('accepts a full-stack call when allowAllIn is true', () => {
    const dealt = dealHand({
      seats: [
        { seatId: '1', stack: 2000 },
        { seatId: '4', stack: 2000 },
      ],
      buttonSeatId: '1',
      blinds: { smallBlind: 1, bigBlind: 2 },
      rng: createSeededRng(7),
    });
    expect(dealt.ok).toBe(true);
    if (!dealt.ok) {
      return;
    }

    const raised = applyAction(dealt.value, dealt.value.currentSeatId!, {
      type: 'raise',
      amount: 2000,
    }, { allowAllIn: true });
    expect(raised.ok).toBe(true);
    if (!raised.ok) {
      return;
    }

    const actor = raised.value.currentSeatId!;
    const caller = raised.value.seats.find((seat) => seat.seatId === actor)!;
    const result = legalize(
      raised.value,
      actor,
      { type: 'call' },
      { allowAllIn: true },
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.value.type === 'call') {
      expect(result.value.amount).toBe(caller.stack);
    }
  });

  it('rejects full-stack call when allowAllIn is false', () => {
    const state = {
      seats: [
        {
          seatId: '1',
          stack: 150,
          hole: ['As', 'Ah'] as const,
          folded: false,
          streetCommitted: 0,
          handCommitted: 0,
        },
        {
          seatId: '4',
          stack: 2000,
          hole: ['Kd', 'Kc'] as const,
          folded: false,
          streetCommitted: 0,
          handCommitted: 0,
        },
      ],
      buttonSeatId: '1',
      blinds: { smallBlind: 1, bigBlind: 2 },
      street: 'preflop' as const,
      phase: 'betting' as const,
      currentSeatId: '1',
      board: [],
      pot: 3,
      currentBet: 150,
      lastRaiseSize: 148,
      deckRemaining: [],
      burns: [],
      winners: null,
      completeReason: null,
    };

    const rejected = legalize(state, '1', { type: 'call' });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.error.code).toBe('all_in_or_side_pot_unsupported');
    }
  });

  it('builds main and side pots for unequal commitments', () => {
    const state: HandState = {
      seats: [
        {
          seatId: '1',
          stack: 0,
          hole: ['As', 'Ah'],
          folded: false,
          allIn: true,
          streetCommitted: 500,
          handCommitted: 500,
        },
        {
          seatId: '2',
          stack: 0,
          hole: ['Kd', 'Kc'],
          folded: false,
          allIn: true,
          streetCommitted: 300,
          handCommitted: 300,
        },
        {
          seatId: '3',
          stack: 0,
          hole: ['Qd', 'Qc'],
          folded: false,
          allIn: true,
          streetCommitted: 100,
          handCommitted: 100,
        },
      ],
      buttonSeatId: '1',
      blinds: { smallBlind: 1, bigBlind: 2 },
      street: 'river',
      phase: 'showdown_ready',
      currentSeatId: null,
      board: ['2s', '3h', '4d', '5c', '6s'],
      pot: 900,
      currentBet: 0,
      lastRaiseSize: 2,
      deckRemaining: [],
      burns: [],
      winners: null,
      completeReason: null,
    };

    const pots = buildSidePots(state);
    expect(pots).toHaveLength(3);
    expect(pots[0]).toMatchObject({ label: 'Main', amount: 300 });
    expect(pots[1]).toMatchObject({ label: 'Side', amount: 400 });
    expect(pots[2]).toMatchObject({ label: 'Side 2', amount: 200 });
  });

  it('returns uncalled chips to the bettor', () => {
    const state: HandState = {
      seats: [
        {
          seatId: '1',
          stack: 0,
          hole: ['As', 'Ah'],
          folded: false,
          allIn: true,
          streetCommitted: 500,
          handCommitted: 500,
        },
        {
          seatId: '2',
          stack: 1700,
          hole: ['Kd', 'Kc'],
          folded: true,
          streetCommitted: 300,
          handCommitted: 300,
        },
      ],
      buttonSeatId: '1',
      blinds: { smallBlind: 1, bigBlind: 2 },
      street: 'preflop',
      phase: 'fold_to_one',
      currentSeatId: null,
      board: [],
      pot: 800,
      currentBet: 500,
      lastRaiseSize: 498,
      deckRemaining: [],
      burns: [],
      winners: null,
      completeReason: null,
    };

    returnUncalledChips(state);
    expect(state.pot).toBe(600);
    expect(state.seats[0]!.stack).toBe(200);
    expect(state.seats[0]!.handCommitted).toBe(300);
  });
});

describe('finalizeTerminalHand', () => {
  it('auto-runs out and settles when everyone is all-in', () => {
    const dealt = dealHand({
      seats: [
        { seatId: '1', stack: 2000 },
        { seatId: '4', stack: 2000 },
      ],
      buttonSeatId: '1',
      blinds: { smallBlind: 1, bigBlind: 2 },
      rng: createSeededRng(7),
    });
    expect(dealt.ok).toBe(true);
    if (!dealt.ok) {
      return;
    }

    const allIn = applyAction(dealt.value, dealt.value.currentSeatId!, {
      type: 'raise',
      amount: 2000,
    }, { allowAllIn: true });
    expect(allIn.ok).toBe(true);
    if (!allIn.ok) {
      return;
    }

    const callSeat = allIn.value.currentSeatId!;
    const called = applyAction(allIn.value, callSeat, { type: 'call' }, { allowAllIn: true });
    expect(called.ok).toBe(true);
    if (!called.ok) {
      return;
    }

    const finalized = finalizeTerminalHand(called.value);
    expect(finalized.ok).toBe(true);
    if (!finalized.ok) {
      return;
    }

    expect(finalized.value.phase).toBe('complete');
    expect(finalized.value.completeReason).toBe('showdown');
    expect(finalized.value.board).toHaveLength(5);
    expect(finalized.value.pot).toBe(0);
    expect(finalized.value.seats.every((seat) => seat.stack >= 0)).toBe(true);
    expect(finalized.value.seats.reduce((sum, seat) => sum + seat.stack, 0)).toBe(4000);
  });
});
