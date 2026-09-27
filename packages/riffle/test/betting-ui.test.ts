// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderActionsBar } from '../src/client/actions-bar.js';
import { renderHandInProgress } from '../src/client/surfaces/hand-in-progress.js';
import { renderMyTurn } from '../src/client/surfaces/my-turn.js';
import { TEST_MATCH_ID } from './helpers/fixtures.js';

const SAMPLE_HOLES = ['As', 'Kh'] as const;

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

describe('betting felt UI', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    vi.restoreAllMocks();
  });

  it('renders my-turn operable bar with confirm on raise at desktop width', () => {
    setViewport(960, 640);
    const root = document.getElementById('app')!;
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);
    const onSubmit = vi.fn();

    renderMyTurn(root, {
      matchId: TEST_MATCH_ID,
      seatId: 's0',
      hole: [SAMPLE_HOLES[0], SAMPLE_HOLES[1]],
      pot: 150,
      stacks: [
        { seatId: 's0', stack: 9950 },
        { seatId: 's1', stack: 9900 },
      ],
      facingBet: true,
      legalActions: [
        { type: 'fold' },
        { type: 'call', amount: 100 },
        { type: 'raise', amount: 300 },
      ],
      onSubmitAction: onSubmit,
    });

    expect(root.querySelector('.turn-status')?.textContent).toBe('Your turn · actionable');
    expect(root.querySelector('.action-check-call')?.textContent).toBe('Call');
    expect(root.querySelector('.action-bet-raise')?.textContent).toBe('Raise');
    expect(root.querySelector('.table-pot')?.textContent).toContain('150');

    const raiseButton = root.querySelector('.action-bet-raise') as HTMLButtonElement;
    raiseButton.click();
    expect(confirmSpy).toHaveBeenCalledWith('Confirm irreversible chip commit before send');
    expect(onSubmit).toHaveBeenCalledWith({ type: 'raise', amount: 300 });
  });

  it('renders off-turn disabled bar without amount field at narrow width', () => {
    setViewport(360, 640);
    const root = document.getElementById('app')!;

    renderHandInProgress(root, {
      matchId: TEST_MATCH_ID,
      seatId: 's1',
      hole: [SAMPLE_HOLES[0], SAMPLE_HOLES[1]],
      pot: 150,
      stacks: [
        { seatId: 's0', stack: 9950 },
        { seatId: 's1', stack: 9900 },
      ],
      showDisabledActionsBar: true,
      facingBet: true,
    });

    expect(root.querySelector('.turn-status')?.textContent).toBe(
      'Seat 2 to act · not your turn',
    );
    expect(root.querySelector('.actions-bar-amount')).toBeNull();
    expect(root.querySelector('.actions-bar')?.classList.contains('actions-bar-disabled')).toBe(
      true,
    );

    const disabledButtons = root.querySelectorAll('.action-button:disabled');
    expect(disabledButtons.length).toBeGreaterThan(0);
  });

  it('exposes keyboard-focusable controls with visible labels', () => {
    setViewport(960, 640);
    const host = document.createElement('div');
    renderActionsBar(host, {
      enabled: true,
      facingBet: false,
      legalActions: [{ type: 'fold' }, { type: 'check' }, { type: 'bet', amount: 100 }],
      onSubmit: vi.fn(),
    });

    const buttons = host.querySelectorAll('button');
    expect(buttons.length).toBe(3);
    buttons.forEach((button) => {
      expect(button.textContent?.length).toBeGreaterThan(0);
    });
    expect(host.querySelector('.focus-hint')?.textContent).toContain('non-color ring');
  });
});
