// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderBoardArea, boardLengthFromContext } from '../src/client/board.js';
import { renderHandInProgress } from '../src/client/surfaces/hand-in-progress.js';
import { renderMyTurn } from '../src/client/surfaces/my-turn.js';
import { TEST_MATCH_ID } from './helpers/fixtures.js';

const SAMPLE_HOLES = ['As', 'Kh'] as const;
const SAMPLE_BOARD_FLOP = ['7c', '2d', '9h'] as const;
const SAMPLE_BOARD_TURN = ['7c', '2d', '9h', 'Qc'] as const;
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

describe('public board felt UI', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    vi.restoreAllMocks();
  });

  it('renders flop with three BOARD-tagged cards at desktop width', () => {
    setViewport(960, 640);
    const root = document.getElementById('app')!;

    renderHandInProgress(root, {
      matchId: TEST_MATCH_ID,
      seatId: 's1',
      hole: [SAMPLE_HOLES[0], SAMPLE_HOLES[1]],
      board: [...SAMPLE_BOARD_FLOP],
      pot: 600,
      stacks: [
        { seatId: 's0', stack: 9700 },
        { seatId: 's1', stack: 9700 },
      ],
      showDisabledActionsBar: true,
    });

    expect(root.querySelector('.board-street-label')?.textContent).toBe('FLOP');
    expect(root.querySelectorAll('.board-card')).toHaveLength(3);
    expect(root.querySelectorAll('.board-card[data-tag="BOARD"]')).toHaveLength(3);
    expect(root.querySelectorAll('.hole-card[data-tag="YOU"]')).toHaveLength(2);
    expect(boardLengthFromContext({ board: [...SAMPLE_BOARD_FLOP] })).toBe(3);
  });

  it('renders turn with four BOARD cards on my-turn at narrow width', () => {
    setViewport(360, 640);
    const root = document.getElementById('app')!;

    renderMyTurn(root, {
      matchId: TEST_MATCH_ID,
      seatId: 's0',
      hole: [SAMPLE_HOLES[0], SAMPLE_HOLES[1]],
      board: [...SAMPLE_BOARD_TURN],
      pot: 600,
      stacks: [
        { seatId: 's0', stack: 9700 },
        { seatId: 's1', stack: 9700 },
      ],
      legalActions: [{ type: 'check' }, { type: 'bet', amount: 100 }],
      onSubmitAction: vi.fn(),
    });

    expect(root.querySelector('.board-street-label')?.textContent).toBe('TURN');
    expect(root.querySelectorAll('.board-card')).toHaveLength(4);
    expect(root.querySelector('.turn-status')?.textContent).toBe('Your turn · actionable');
  });

  it('renders river with five BOARD cards and announces street change', () => {
    setViewport(960, 640);
    const host = document.createElement('div');
    renderBoardArea(host, {
      board: [...SAMPLE_BOARD_RIVER],
      previousBoardLength: 4,
    });

    expect(host.querySelector('.board-street-label')?.textContent).toBe('RIVER');
    expect(host.querySelectorAll('.board-card')).toHaveLength(5);
    expect(host.querySelector('.street-live-region')?.textContent).toBe('Street RIVER');
  });

  it('leaves empty board slots before first street deal', () => {
    setViewport(360, 640);
    const host = document.createElement('div');
    renderBoardArea(host, { board: [] });
    expect(host.querySelector('.board-street-label')).toBeNull();
    expect(host.querySelectorAll('.board-card')).toHaveLength(0);
    expect(host.querySelectorAll('.board-slot-empty')).toHaveLength(5);
  });

  it('distinguishes YOU and BOARD without color-only cues', () => {
    setViewport(960, 640);
    const root = document.getElementById('app')!;
    renderHandInProgress(root, {
      matchId: TEST_MATCH_ID,
      seatId: 's1',
      hole: [SAMPLE_HOLES[0], SAMPLE_HOLES[1]],
      board: [...SAMPLE_BOARD_FLOP],
    });

    const boardCards = root.querySelectorAll('.board-card');
    for (const card of boardCards) {
      expect(card.textContent).toMatch(/^[2-9TJQKA][shdc]$/);
      expect(card.getAttribute('aria-label')).toContain('Board card');
    }
    expect(root.querySelector('.player-seat-label')?.textContent).toBe('YOU');
  });
});
