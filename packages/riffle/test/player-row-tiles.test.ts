// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  deriveInitials,
  formatPlayChips,
  formatTimerText,
  renderPlayerRow,
  type PlayerRowSeat,
} from '../src/client/dashboard/player-row.js';
import { renderDashboardTableShell } from '../src/client/dashboard/table-shell.js';

const XSS_NAME = '<img src=x onerror=alert(1)>';

function setViewport(width: number, height: number): void {
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

function mountDashboard(width: number, height: number): HTMLElement {
  setViewport(width, height);
  const root = document.createElement('main');
  root.id = 'app';
  document.body.replaceChildren(root);
  renderDashboardTableShell(root, {
    tableName: 'Friday Night',
    blindsLabel: '$1 / $2',
    seatedPlayersLabel: '3 / 8',
    handNumber: 4,
    street: 'Turn',
  });
  return root;
}

function baseSeat(overrides: Partial<PlayerRowSeat> = {}): PlayerRowSeat {
  return {
    seatId: 's1',
    displayName: 'Sam K.',
    isLocal: false,
    stack: 2000,
    inHand: true,
    lastAction: 'Call $20',
    committed: 40,
    position: null,
    acting: false,
    turnRemainingMs: null,
    turnBudgetMs: null,
    ...overrides,
  };
}

function renderAtViewport(
  width: number,
  height: number,
  seats: PlayerRowSeat[],
): HTMLElement {
  const root = mountDashboard(width, height);
  const region = root.querySelector('[data-region="player-row"]') as HTMLElement;
  renderPlayerRow(region, seats);
  return root;
}

describe('player row tiles', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.replaceChildren();
  });

  it('formats play chips and timer text', () => {
    expect(formatPlayChips(2000)).toBe('$2,000');
    expect(formatTimerText(125_000)).toBe('2:05');
    expect(formatTimerText(59_999)).toBe('1:00');
    expect(deriveInitials('Sam K.')).toBe('SK');
    expect(deriveInitials('Alex')).toBe('AL');
    expect(deriveInitials('Q')).toBe('Q');
  });

  it('renders desktop tiles for every occupied seat including You', () => {
    const root = renderAtViewport(1280, 832, [
      baseSeat({
        seatId: 's0',
        displayName: 'Jordan',
        isLocal: true,
        avatarUrl: 'https://example.com/jordan.png',
        acting: true,
        turnRemainingMs: 90_000,
        turnBudgetMs: 120_000,
        position: 'D',
      }),
      baseSeat({
        seatId: 's1',
        displayName: 'Riley',
        position: 'SB',
      }),
      baseSeat({
        seatId: 's2',
        displayName: 'Casey',
        inHand: false,
        lastAction: 'Fold',
        committed: 0,
        position: 'BB',
      }),
    ]);

    expect(root.dataset.breakpoint).toBe('desktop');
    const tiles = root.querySelectorAll('.player-row-tile');
    expect(tiles).toHaveLength(3);

    const localTile = root.querySelector('[data-seat="s0"]');
    expect(localTile?.getAttribute('data-local')).toBe('true');
    expect(localTile?.querySelector('[data-field="name"]')?.textContent).toBe('You');
    expect(localTile?.querySelector('[data-field="avatar"]')).not.toBeNull();
    expect(localTile?.querySelector('[data-field="cards"]')).toBeNull();
    expect(localTile?.querySelector('[data-field="timer"]')?.textContent).toBe(
      '1:30',
    );
    expect(localTile?.querySelector('[data-field="timer-bar"]')).not.toBeNull();
    expect(localTile?.querySelector('.player-row-stack-label')?.textContent).toBe(
      'Stack',
    );

    const opponent = root.querySelector('[data-seat="s1"]');
    expect(opponent?.querySelector('[data-field="cards"]')?.getAttribute('data-cards')).toBe(
      'backs',
    );
    expect(opponent?.querySelectorAll('.player-row-card-back')).toHaveLength(2);
    expect(opponent?.querySelector('.hole-card-rank-suit')).toBeNull();
    for (const back of opponent?.querySelectorAll('.player-row-card-back') ?? []) {
      expect(back.textContent).toBe('');
    }

    const folded = root.querySelector('[data-seat="s2"]');
    expect(folded?.getAttribute('data-state')).toBe('folded');
    expect(folded?.querySelector('[data-field="fold"]')?.textContent).toBe('Fold');
    expect(folded?.querySelector('[data-field="cards"]')).toBeNull();

    expect(
      root.querySelector('[data-seat="s0"] [data-field="position"]')?.getAttribute(
        'aria-label',
      ),
    ).toBe('Dealer');
    expect(
      root.querySelector('[data-seat="s1"] [data-field="position"]')?.getAttribute(
        'aria-label',
      ),
    ).toBe('Small blind');
    expect(
      root.querySelector('[data-seat="s2"] [data-field="position"]')?.getAttribute(
        'aria-label',
      ),
    ).toBe('Big blind');

    expect(root.querySelector('[role="status"]')?.textContent).toBe('Your turn');
  });

  it('renders tablet tiles with stack label and street commitment', () => {
    const root = renderAtViewport(834, 1194, [
      baseSeat({
        seatId: 's0',
        isLocal: true,
        displayName: 'Jordan',
      }),
      baseSeat({
        seatId: 's1',
        displayName: 'Riley',
        committed: 40,
      }),
    ]);

    expect(root.dataset.breakpoint).toBe('tablet');
    expect(root.querySelectorAll('.player-row-tile')).toHaveLength(2);
    expect(
      root.querySelector('[data-seat="s1"] [data-field="committed"]')?.textContent,
    ).toBe('$40 in');
  });

  it('renders phone opponents without You, card backs, or timer', () => {
    const root = renderAtViewport(402, 874, [
      baseSeat({
        seatId: 's0',
        isLocal: true,
        displayName: 'Jordan',
        acting: true,
        turnRemainingMs: 60_000,
        turnBudgetMs: 60_000,
      }),
      baseSeat({
        seatId: 's1',
        displayName: 'Riley',
        avatarUrl: undefined,
      }),
      baseSeat({
        seatId: 's2',
        displayName: 'Casey',
        inHand: false,
      }),
    ]);

    expect(root.dataset.breakpoint).toBe('phone');
    const tiles = root.querySelectorAll('.player-row-tile');
    expect(tiles).toHaveLength(2);
    expect(root.querySelector('[data-local="true"]')).toBeNull();
    expect(root.querySelector('[data-field="cards"]')).toBeNull();
    expect(root.querySelector('[data-field="timer"]')).toBeNull();
    expect(root.querySelector('[role="status"]')).toBeNull();
    expect(root.querySelector('[data-field="committed"]')).toBeNull();
    expect(root.querySelector('[data-seat="s1"] [data-field="initials"]')?.textContent).toBe(
      'RI',
    );
    expect(root.querySelector('[data-seat="s2"] [data-field="fold"]')).toBeNull();
  });

  it('omits media controls and escapes HTML display names', () => {
    const root = renderAtViewport(1280, 832, [
      baseSeat({
        seatId: 's0',
        displayName: XSS_NAME,
      }),
    ]);

    const name = root.querySelector('[data-field="name"]');
    expect(name?.textContent).toBe(XSS_NAME);
    expect(name?.querySelector('img')).toBeNull();
    expect(document.querySelector('img[src="x"]')).toBeNull();

    const text = root.textContent ?? '';
    expect(text).not.toMatch(/Mic|Camera|Muted/i);
    expect(root.querySelector('video')).toBeNull();
    expect(root.querySelector('audio')).toBeNull();
  });

  it('ignores leaked rank and suit fields on opponents', () => {
    const root = renderAtViewport(1280, 832, [
      baseSeat({
        seatId: 's1',
        displayName: 'Riley',
        inHand: true,
        ...( {
          rank: 'A',
          suit: 's',
          holeCards: ['As', 'Kh'],
        } as Partial<PlayerRowSeat> ),
      }),
    ]);

    expect(root.querySelector('[data-field="cards"]')?.getAttribute('data-cards')).toBe(
      'backs',
    );
    expect(root.textContent).not.toContain('As');
    expect(root.textContent).not.toContain('Kh');
  });

  it('omits the local timer when the seat is not acting', () => {
    const root = renderAtViewport(1280, 832, [
      baseSeat({
        seatId: 's0',
        isLocal: true,
        displayName: 'Jordan',
        acting: false,
        turnRemainingMs: 60_000,
        turnBudgetMs: 60_000,
      }),
    ]);

    expect(root.querySelector('[data-field="timer"]')).toBeNull();
    expect(root.querySelector('[role="status"]')).toBeNull();
  });

  it.each([
    ['desktop', 1280, 832],
    ['tablet', 834, 1194],
    ['phone', 402, 874],
  ])('shows all-in text and Won amount at %s', (_label, width, height) => {
    const root = renderAtViewport(width, height, [
      baseSeat({
        seatId: 's1',
        displayName: 'Riley',
        stack: 0,
        inHand: true,
        allIn: true,
      }),
      baseSeat({
        seatId: 's2',
        displayName: 'Sam',
        stack: 2500,
        inHand: true,
        wonAmount: 1800,
        phase: 'complete',
      }),
    ]);

    expect(root.textContent).toContain('All-in');
    expect(root.textContent).toContain('$0');
    expect(root.textContent).toContain('Won $1,800');
  });
});
