import { describe, expect, it } from 'vitest';
import { createSeededRng, dealHand } from '../../src/rules/index.js';
import {
  altDealConfig,
  FIXTURE_BB,
  FIXTURE_SB,
  FIXTURE_STACK,
  huDealConfig,
  mustDeal,
  threeSeatDealConfig,
} from './helpers.js';

describe('dealHand', () => {
  it('posts blinds and deals two unique hole cards per seat (heads-up)', () => {
    const state = mustDeal(huDealConfig(1));
    expect(state.pot).toBe(FIXTURE_SB + FIXTURE_BB);
    expect(state.currentBet).toBe(FIXTURE_BB);
    expect(state.street).toBe('preflop');
    expect(state.phase).toBe('betting');

    for (const seat of state.seats) {
      expect(seat.hole[0]).not.toBe(seat.hole[1]);
      expect(seat.stack).toBeLessThan(FIXTURE_STACK);
    }

    const allCards = state.seats.flatMap((s) => [s.hole[0], s.hole[1]]);
    expect(new Set(allCards).size).toBe(allCards.length);
  });

  it('deals three-seat table with s0 button, s1 SB, s2 BB', () => {
    const state = mustDeal(threeSeatDealConfig());
    expect(state.seats.find((s) => s.seatId === 's1')!.streetCommitted).toBe(FIXTURE_SB);
    expect(state.seats.find((s) => s.seatId === 's2')!.streetCommitted).toBe(FIXTURE_BB);
    expect(state.currentSeatId).toBe('s0');
  });

  it('same seed yields same hole cards', () => {
    const a = mustDeal(huDealConfig(123));
    const b = mustDeal(huDealConfig(123));
    expect(a.seats.map((s) => s.hole)).toEqual(b.seats.map((s) => s.hole));
  });

  it('different stacks/blinds still deal when stacks exceed big blind', () => {
    const result = dealHand(altDealConfig());
    expect(result.ok).toBe(true);
  });

  it('refuses fewer than two seats', () => {
    const result = dealHand({
      seats: [{ seatId: 'solo', stack: FIXTURE_STACK }],
      buttonSeatId: 'solo',
      blinds: { smallBlind: FIXTURE_SB, bigBlind: FIXTURE_BB },
      rng: createSeededRng(1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_config');
    }
  });

  it('refuses more than nine seats', () => {
    const seats = Array.from({ length: 10 }, (_, i) => ({
      seatId: `s${i}`,
      stack: FIXTURE_STACK,
    }));
    const result = dealHand({
      seats,
      buttonSeatId: 's0',
      blinds: { smallBlind: FIXTURE_SB, bigBlind: FIXTURE_BB },
      rng: createSeededRng(1),
    });
    expect(result.ok).toBe(false);
  });

  it('refuses stack not strictly greater than big blind', () => {
    const result = dealHand({
      seats: [
        { seatId: 's0', stack: FIXTURE_BB },
        { seatId: 's1', stack: FIXTURE_STACK },
      ],
      buttonSeatId: 's0',
      blinds: { smallBlind: FIXTURE_SB, bigBlind: FIXTURE_BB },
      rng: createSeededRng(1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_config');
    }
  });
});
