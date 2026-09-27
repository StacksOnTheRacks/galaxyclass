import { describe, expect, it } from 'vitest';
import { evaluateHandStrength } from '../src/client/dashboard/hand-strength.js';

describe('hand strength', () => {
  it('names two pair on the turn with full house outs', () => {
    expect(evaluateHandStrength(['Kh', '7h'], ['Kd', '7c', '2s', '9d'], 'turn')).toEqual({
      madeHand: 'Two Pair, Kings & Sevens',
      tier: 'Strong',
      meterFilled: 3,
      outsCount: 4,
      outsPhrase: 'Improves to a full house on the river',
    });
  });

  it('shows pocket pair preflop without tier or outs', () => {
    expect(evaluateHandStrength(['Qs', 'Qd'], [], 'preflop')).toEqual({
      madeHand: 'Pair of Queens',
      meterFilled: 2,
    });
  });

  it('shows high card preflop', () => {
    expect(evaluateHandStrength(['2c', 'Ah'], [], 'preflop').madeHand).toBe('Ace high');
  });

  it('counts flush draw outs on the flop', () => {
    const strength = evaluateHandStrength(['Ah', '5h'], ['Kh', '9h', '2c'], 'flop');
    expect(strength.madeHand).toBe('Ace high');
    expect(strength.tier).toBe('Weak');
    expect(strength.outsPhrase).toBe('Improves to a flush on the turn');
    expect(strength.outsCount).toBeGreaterThanOrEqual(9);
  });

  it('ignores cards that only pair the board', () => {
    const strength = evaluateHandStrength(['Ah', 'Kd'], ['Qs', '8c', '4h', '2d'], 'turn');
    // Only the three remaining aces and kings improve the player's hand to a pair.
    expect(strength.outsCount).toBe(6);
    expect(strength.outsPhrase).toBe('Improves to a pair on the river');
  });

  it('omits outs on the river', () => {
    const strength = evaluateHandStrength(['Kh', '7h'], ['Kd', '7c', '2s', '9d', '3c'], 'river');
    expect(strength.outsCount).toBeUndefined();
    expect(strength.outsPhrase).toBeUndefined();
  });

  it('fills the whole meter for a royal flush', () => {
    const strength = evaluateHandStrength(['Ah', 'Kh'], ['Qh', 'Jh', 'Th'], 'flop');
    expect(strength.madeHand).toBe('Royal Flush');
    expect(strength.meterFilled).toBe(10);
    expect(strength.tier).toBe('Monster');
  });

  it('names a full house', () => {
    expect(evaluateHandStrength(['6h', '6d'], ['6c', 'Js', 'Jd'], 'flop').madeHand).toBe(
      'Full House, Sixes over Jacks',
    );
  });
});
