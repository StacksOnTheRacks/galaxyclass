// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  renderHandComplete,
  renderShowdown,
  renderWaitingForDeal,
} from '../src/client/hand-complete.js';
import { TEST_MATCH_ID } from './helpers/fixtures.js';

const SAMPLE_HOLES = ['As', 'Kh'] as const;
const SAMPLE_BOARD_RIVER = ['7c', '2d', '9h', 'Qc', '3s'] as const;

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: height,
  });
  window.dispatchEvent(new Event('resize'));
}

describe('hand complete UI', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    vi.restoreAllMocks();
  });

  it('renders showdown frame with Continue only at desktop width', () => {
    setViewport(960, 640);
    const root = document.getElementById('app')!;

    renderShowdown(root, {
      matchId: TEST_MATCH_ID,
      seatId: 's1',
      hole: [SAMPLE_HOLES[0], SAMPLE_HOLES[1]],
      board: [...SAMPLE_BOARD_RIVER],
      pot: 40,
      winners: [{ seatId: 's1', amount: 40 }],
      shownHoles: [
        { seatId: 's0', hole: ['2c', '3d'] },
        { seatId: 's1', hole: ['As', 'Kh'] },
      ],
      onContinue: vi.fn(),
    });

    expect(root.dataset.surface).toBe('showdown');
    expect(root.querySelector('.street-label')?.textContent).toBe('Street: Showdown');
    expect(root.querySelector('.turn-status')?.textContent).toContain('Showdown · s1 wins');
    expect(root.querySelectorAll('.board-card[data-tag="BOARD"]')).toHaveLength(5);
    expect(root.querySelectorAll('.hole-card[data-tag="YOU"]')).toHaveLength(2);
    expect(root.querySelector('.action-continue')?.textContent).toBe('Continue');
    expect(root.querySelector('.action-fold')).toBeNull();
    expect(root.querySelector('.action-check-call')).toBeNull();
    expect(root.querySelector('.action-bet-raise')).toBeNull();
    expect(root.querySelector('.complete-live-region')?.textContent).toContain('Showdown');
  });

  it('renders showdown at narrow iframe width', () => {
    setViewport(360, 640);
    const root = document.getElementById('app')!;

    renderShowdown(root, {
      matchId: TEST_MATCH_ID,
      seatId: 's1',
      hole: [SAMPLE_HOLES[0], SAMPLE_HOLES[1]],
      board: [...SAMPLE_BOARD_RIVER],
      winners: [{ seatId: 's1', amount: 40 }],
    });

    expect(root.querySelector('.surface-showdown')).toBeTruthy();
    expect(root.querySelector('.action-continue')).toBeTruthy();
  });

  it('renders hand-complete frame with award line and Next hand / Leave table', () => {
    setViewport(960, 640);
    const root = document.getElementById('app')!;

    renderHandComplete(root, {
      matchId: TEST_MATCH_ID,
      seatId: 's1',
      hole: [SAMPLE_HOLES[0], SAMPLE_HOLES[1]],
      board: [...SAMPLE_BOARD_RIVER],
      winners: [{ seatId: 's1', amount: 40 }],
      completeReason: 'fold_to_one',
      onNextHand: vi.fn(),
      onLeaveTable: vi.fn(),
    });

    expect(root.dataset.surface).toBe('hand-complete');
    expect(root.querySelector('.street-label')?.textContent).toBe('Street: Hand complete');
    expect(root.querySelector('.hand-complete-award')?.textContent).toBe(
      'Awarded pot 40 · Seat s1',
    );
    expect(root.querySelector('.action-next-hand')?.textContent).toBe('Next hand');
    expect(root.querySelector('.action-leave-table')?.textContent).toBe('Leave table');
    expect(root.querySelector('.action-leave-table')?.dataset.confirmAffordance).toBe(
      'Confirm table-exit before it fires',
    );
    expect(root.querySelector('.complete-live-region')?.textContent).toContain('Hand over');
  });

  it('tags shown opponent holes distinctly from YOU and BOARD', () => {
    setViewport(960, 640);
    const root = document.getElementById('app')!;

    renderShowdown(root, {
      matchId: TEST_MATCH_ID,
      seatId: 's1',
      hole: [SAMPLE_HOLES[0], SAMPLE_HOLES[1]],
      board: [...SAMPLE_BOARD_RIVER],
      shownHoles: [{ seatId: 's0', hole: ['2c', '3d'] }],
    });

    expect(root.querySelector('.shown-hole-card')?.dataset.tag).toBe('SHOWN');
    expect(root.querySelector('.shown-hole-label')?.textContent).toContain('SHOWN · s0');
    expect(root.querySelector('.player-seat-label')?.textContent).toBe('YOU');
  });

  it('Continue and Next hand do not POST or fetch Turnur', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const root = document.getElementById('app')!;

    const onContinue = vi.fn();
    renderShowdown(root, {
      matchId: TEST_MATCH_ID,
      seatId: 's1',
      hole: [SAMPLE_HOLES[0], SAMPLE_HOLES[1]],
      onContinue,
    });
    (root.querySelector('.action-continue') as HTMLButtonElement).click();
    expect(onContinue).toHaveBeenCalledTimes(1);

    const onNextHand = vi.fn();
    renderHandComplete(root, {
      matchId: TEST_MATCH_ID,
      seatId: 's1',
      winners: [{ seatId: 's1', amount: 40 }],
      onNextHand,
    });
    (root.querySelector('.action-next-hand') as HTMLButtonElement).click();
    expect(onNextHand).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Next hand returns to waiting-for-deal shell', () => {
    const root = document.getElementById('app')!;
    renderWaitingForDeal(root, TEST_MATCH_ID);
    expect(root.dataset.surface).toBe('table-shell');
    expect(root.querySelector('.surface-title')?.textContent).toBe('Waiting for deal');
  });
});
