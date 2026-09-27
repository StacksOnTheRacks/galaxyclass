// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { renderHandInProgress } from '../src/client/surfaces/hand-in-progress.js';
import { renderMyTurn } from '../src/client/surfaces/my-turn.js';
import { renderTableShell } from '../src/client/surfaces/table-shell.js';
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

describe('hole card felt surfaces', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
  });

  it('renders waiting-for-deal empty hole area at desktop width', () => {
    setViewport(960, 640);
    const root = document.getElementById('app')!;
    renderTableShell(root, { matchId: TEST_MATCH_ID });

    expect(root.dataset.surface).toBe('table-shell');
    expect(root.querySelector('.hole-area')?.getAttribute('aria-label')).toBe(
      'Your hole cards, seat-private, empty',
    );
    expect(root.querySelector('.hole-cards-empty')).not.toBeNull();
    expect(root.querySelector('.hole-card')).toBeNull();
  });

  it('renders hand-in-progress with YOU-tagged dealt holes at desktop width', () => {
    setViewport(960, 640);
    const root = document.getElementById('app')!;

    renderHandInProgress(root, {
      matchId: TEST_MATCH_ID,
      seatId: 's0',
      hole: [SAMPLE_HOLES[0], SAMPLE_HOLES[1]],
      opponents: [
        { seatId: 's1', label: 'Seat 1', stack: '10,000' },
        { seatId: 's2', label: 'Seat 2', stack: '10,000' },
      ],
    });

    expect(root.dataset.surface).toBe('hand-in-progress');
    expect(root.querySelector('.hole-area')?.getAttribute('aria-label')).toBe(
      'Your hole cards (seat-private)',
    );

    const cards = root.querySelectorAll('.hole-card');
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.querySelector('.hole-card-tag')?.textContent).toBe('YOU');
    }
    expect(root.querySelector('.hole-card-rank-suit')?.textContent).toBe('As');

    expect(root.querySelector('.opponent-seat')).not.toBeNull();
    expect(root.textContent).not.toContain('Seat 1As');
    expect(root.querySelector('.hole-card-back')).toBeNull();
    expect(root.querySelector('[role="status"]')?.textContent).toContain(
      'Hole cards dealt',
    );
  });

  it('renders hand-in-progress at narrow iframe width', () => {
    setViewport(360, 640);
    const root = document.getElementById('app')!;

    renderHandInProgress(root, {
      matchId: TEST_MATCH_ID,
      seatId: 's0',
      hole: [SAMPLE_HOLES[0], SAMPLE_HOLES[1]],
      opponents: [{ seatId: 's1', label: 'Seat 1', stack: '10,000' }],
    });

    expect(root.querySelectorAll('.hole-card')).toHaveLength(2);
    expect(root.querySelector('.surface-hand-in-progress')).not.toBeNull();
  });

  it('renders my-turn with own holes visible and no betting controls', () => {
    setViewport(960, 640);
    const root = document.getElementById('app')!;

    renderMyTurn(root, {
      matchId: TEST_MATCH_ID,
      seatId: 's0',
      hole: [SAMPLE_HOLES[0], SAMPLE_HOLES[1]],
      opponents: [{ seatId: 's1', label: 'Seat 1', stack: '10,000' }],
    });

    expect(root.dataset.surface).toBe('my-turn');
    expect(root.querySelectorAll('.hole-card')).toHaveLength(2);
    expect(root.querySelector('.betting-controls')).toBeNull();
    expect(root.querySelector('button')).toBeNull();
  });

  it('renders my-turn at narrow iframe width', () => {
    setViewport(360, 640);
    const root = document.getElementById('app')!;

    renderMyTurn(root, {
      matchId: TEST_MATCH_ID,
      seatId: 's0',
      hole: [SAMPLE_HOLES[0], SAMPLE_HOLES[1]],
    });

    expect(root.querySelector('.surface-my-turn')).not.toBeNull();
    expect(root.querySelectorAll('.hole-card-rank-suit')[1]?.textContent).toBe('Kh');
  });

  it('distinguishes hole cards by YOU tag and letter suits, not color alone', () => {
    setViewport(960, 640);
    const root = document.getElementById('app')!;

    renderHandInProgress(root, {
      matchId: TEST_MATCH_ID,
      seatId: 's0',
      hole: ['Td', '2c'],
    });

    const rankSuits = [...root.querySelectorAll('.hole-card-rank-suit')].map(
      (el) => el.textContent,
    );
    expect(rankSuits).toEqual(['Td', '2c']);
    expect(root.textContent).toContain('Your hole cards (seat-private)');
    expect(root.textContent).not.toContain('BOARD');
  });
});
