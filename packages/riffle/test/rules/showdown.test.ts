import { describe, expect, it } from 'vitest';
import { showdown, type Card, type HandState } from '../../src/rules/index.js';
import { setBoard, setSeatHoles } from './helpers.js';

function showdownFixture(
  holes: Record<string, [Card, Card]>,
  board: Card[],
  pot: number,
): HandState {
  const base: HandState = {
    seats: [
      {
        seatId: 's0',
        stack: 9000,
        hole: holes.s0,
        folded: false,
        streetCommitted: 0,
        handCommitted: 0,
      },
      {
        seatId: 's1',
        stack: 9000,
        hole: holes.s1,
        folded: false,
        streetCommitted: 0,
        handCommitted: 0,
      },
    ],
    buttonSeatId: 's0',
    blinds: { smallBlind: 50, bigBlind: 100 },
    street: 'river',
    phase: 'showdown_ready',
    currentSeatId: null,
    board,
    pot,
    currentBet: 0,
    lastRaiseSize: 100,
    deckRemaining: [],
    burns: [],
    winners: null,
    completeReason: null,
  };
  return base;
}

describe('showdown', () => {
  it('awards pot to pair vs two pair', () => {
    let state = showdownFixture(
      {
        s0: ['As', 'Ah'],
        s1: ['Kd', 'Kc'],
      },
      ['Ad', 'Kh', '2c', '7d', '9s'],
      400,
    );
    state = setSeatHoles(state, 's0', ['As', 'Ah']);
    state = setSeatHoles(state, 's1', ['Kd', 'Kc']);

    const result = showdown(state);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.winners).toHaveLength(1);
    expect(result.value.winners![0].seatId).toBe('s0');
    expect(result.value.winners![0].amount).toBe(400);
    expect(result.value.pot).toBe(0);
  });

  it('ranks flush above straight', () => {
    const state = showdownFixture(
      {
        s0: ['Ts', '9s'],
        s1: ['8d', '7h'],
      },
      ['Js', '2s', '3s', '6c', '5h'],
      500,
    );
    const result = showdown(state);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.winners![0].seatId).toBe('s0');
    expect(result.value.winners![0].rankName).toBe('flush');
  });

  it('splits pot on exact tie with remainder to earliest seat clockwise from button', () => {
    const state = showdownFixture(
      {
        s0: ['As', 'Kd'],
        s1: ['Ac', 'Kh'],
      },
      ['2s', '3h', '4d', '8c', '9s'],
      101,
    );
    const result = showdown(state);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.winners).toHaveLength(2);
    const total = result.value.winners!.reduce((sum, w) => sum + w.amount, 0);
    expect(total).toBe(101);
    const s0Award = result.value.winners!.find((w) => w.seatId === 's0')!.amount;
    const s1Award = result.value.winners!.find((w) => w.seatId === 's1')!.amount;
    expect(Math.abs(s0Award - s1Award)).toBeLessThanOrEqual(1);
    // s1 is first seat clockwise from button s0
    expect(s1Award).toBeGreaterThan(s0Award);
  });

  it('rejects showdown when not showdown_ready', () => {
    const state = { ...showdownFixture({ s0: ['As', 'Ah'], s1: ['Kd', 'Kc'] }, [], 100), phase: 'betting' as const };
    expect(showdown(state).ok).toBe(false);
  });
});

void setBoard;
