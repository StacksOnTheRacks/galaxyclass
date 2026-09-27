// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  renderBoardAndPot,
  type BoardAndPotViewModel,
  type BoardCard,
} from '../src/client/dashboard/board-and-pot.js';
import { renderDashboardTableShell } from '../src/client/dashboard/table-shell.js';

const FLOP: BoardCard[] = [
  { rank: 'K', suit: 'd' },
  { rank: 'T', suit: 'h' },
  { rank: '2', suit: 'c' },
];

const TURN: BoardCard = { rank: 'A', suit: 's' };
const RIVER: BoardCard = { rank: '9', suit: 'd' };

const BASE_VIEW: BoardAndPotViewModel = {
  boardCards: [...FLOP, TURN, RIVER],
  pot: 12_500,
  playersInHand: 3,
  actionOnYou: true,
};

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
    street: 'River',
  });
  return root;
}

function renderAtViewport(
  width: number,
  height: number,
  viewModel: BoardAndPotViewModel = BASE_VIEW,
): HTMLElement {
  const root = mountDashboard(width, height);
  const region = root.querySelector('[data-region="board"]') as HTMLElement;
  renderBoardAndPot(region, viewModel);
  return root;
}

function boardText(root: HTMLElement): string {
  const region = root.querySelector('[data-region="board"]');
  return region?.textContent ?? '';
}

describe('board and pot', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.replaceChildren();
  });

  it.each([
    ['desktop', 1280, 832],
    ['tablet', 834, 1194],
    ['phone', 402, 874],
  ])('renders inside board at %s breakpoint', (_label, width, height) => {
    const root = renderAtViewport(width, height);
    expect(root.dataset.breakpoint).toBe(_label);
    expect(root.querySelector('[data-region="board"] .board-and-pot-panel')).not.toBeNull();
  });

  it('shows street labels on desktop and tablet only', () => {
    for (const viewport of [
      [1280, 832],
      [834, 1194],
    ] as const) {
      const root = renderAtViewport(viewport[0], viewport[1]);
      expect(root.querySelector('[data-field="flop-label"]')?.textContent).toBe('Flop');
      expect(root.querySelector('[data-field="turn-label"]')?.textContent).toBe('Turn');
      expect(root.querySelector('[data-field="river-label"]')?.textContent).toBe('River');
    }

    const phone = renderAtViewport(402, 874);
    expect(phone.querySelector('[data-field="flop-label"]')).toBeNull();
    expect(phone.querySelector('[data-field="turn-label"]')).toBeNull();
    expect(phone.querySelector('[data-field="river-label"]')).toBeNull();
    expect(phone.querySelector('[data-field="board-header"]')?.textContent).toBe('Board');
    expect(phone.querySelector('[data-field="phone-slots"]')).not.toBeNull();
  });

  it.each([
    ['0 cards', [], 3, 1, 1, 5],
    ['3 cards flop only', FLOP, 0, 1, 1, 2],
    ['4 cards flop and turn', [...FLOP, TURN], 0, 0, 1, 1],
    ['5 cards all filled', [...FLOP, TURN, RIVER], 0, 0, 0, 0],
  ])(
    'fills slots in order for %s',
    (_label, boardCards, flopPlaceholders, turnPlaceholders, riverPlaceholders, phonePlaceholders) => {
      const root = renderAtViewport(1280, 832, { boardCards });
      expect(
        root.querySelectorAll('[data-field="flop-slots"] [data-field$="-placeholder"]'),
      ).toHaveLength(flopPlaceholders);
      expect(
        root.querySelectorAll('[data-field="turn-slots"] [data-field$="-placeholder"]'),
      ).toHaveLength(turnPlaceholders);
      expect(
        root.querySelectorAll('[data-field="river-slots"] [data-field$="-placeholder"]'),
      ).toHaveLength(riverPlaceholders);

      const phone = renderAtViewport(402, 874, { boardCards });
      expect(phone.querySelectorAll('[data-field^="phone-slot-"] [data-field$="-placeholder"]')).toHaveLength(
        phonePlaceholders,
      );
    },
  );

  it('shows accessible community card names as text', () => {
    const root = renderAtViewport(1280, 832);
    expect(root.querySelector('[data-field="flop-slot-1"]')?.getAttribute('aria-label')).toBe(
      'King of Diamonds',
    );
    expect(root.querySelector('[data-field="turn-slot-1"]')?.getAttribute('aria-label')).toBe(
      'Ace of Spades',
    );
    expect(root.querySelector('[data-field="river-slot-1"]')?.getAttribute('aria-label')).toBe(
      'Nine of Diamonds',
    );
  });

  it('names empty desktop and tablet slots without using visible question marks as accessible names', () => {
    const root = renderAtViewport(1280, 832, { boardCards: [] });
    expect(root.querySelector('[data-field="flop-slot-1"]')?.getAttribute('aria-label')).toBe(
      'Empty Flop',
    );
    expect(root.querySelector('[data-field="turn-slot-1"]')?.getAttribute('aria-label')).toBe(
      'Empty Turn',
    );
    expect(root.querySelector('[data-field="river-slot-1"]')?.getAttribute('aria-label')).toBe(
      'Empty River',
    );
    expect(root.querySelector('[data-field="flop-slot-1-placeholder"]')?.textContent).toBe('?');
    expect(root.querySelector('[data-field="flop-slot-1"]')?.getAttribute('aria-label')).not.toBe('?');
  });

  it('names empty phone slots as empty board cards', () => {
    const root = renderAtViewport(402, 874, { boardCards: [] });
    const slots = root.querySelectorAll('[data-field="phone-slots"] > .board-card-slot');
    expect(slots).toHaveLength(5);
    for (const slot of slots) {
      expect(slot.getAttribute('aria-label')).toBe('Empty board card');
    }
  });

  it('does not render hole cards from the view model', () => {
    const root = renderAtViewport(1280, 832, {
      boardCards: FLOP,
      holeCards: [{ rank: 'Q', suit: 'h' }, { rank: 'J', suit: 'c' }],
    });

    expect(boardText(root)).not.toContain('Queen of Hearts');
    expect(boardText(root)).not.toContain('Jack of Clubs');
    expect(boardText(root)).not.toContain('Q♥');
    expect(boardText(root)).not.toContain('J♣');
    expect(root.querySelectorAll('.board-card-slot')).toHaveLength(5);
  });

  it('formats pot amounts and omits them when absent', () => {
    for (const viewport of [
      [1280, 832],
      [834, 1194],
      [402, 874],
    ] as const) {
      const withPot = renderAtViewport(viewport[0], viewport[1], {
        boardCards: FLOP,
        pot: 12_500,
      });
      expect(withPot.querySelector('[data-field="pot-amount"]')?.textContent).toBe('$12,500');

      const withoutPot = renderAtViewport(viewport[0], viewport[1], {
        boardCards: FLOP,
      });
      expect(withoutPot.querySelector('[data-field="pot-amount"]')).toBeNull();
      expect(withoutPot.querySelector('[data-field="pot-label"]')?.textContent).toBe('Pot');
    }
  });

  it('shows players-in-hand copy on desktop and tablet with pluralization', () => {
    const plural = renderAtViewport(1280, 832, {
      boardCards: FLOP,
      playersInHand: 4,
    });
    expect(plural.querySelector('[data-field="players-in-hand"]')?.textContent).toBe(
      '4 players in the hand',
    );

    const singular = renderAtViewport(834, 1194, {
      boardCards: FLOP,
      playersInHand: 1,
    });
    expect(singular.querySelector('[data-field="players-in-hand"]')?.textContent).toBe(
      '1 player in the hand',
    );

    const omitted = renderAtViewport(1280, 832, { boardCards: FLOP });
    expect(omitted.querySelector('[data-field="players-in-hand"]')).toBeNull();
  });

  it('never shows players-in-hand on phone', () => {
    const root = renderAtViewport(402, 874, {
      boardCards: FLOP,
      playersInHand: 2,
    });
    expect(root.querySelector('[data-field="players-in-hand"]')).toBeNull();
    expect(boardText(root)).not.toContain('players in the hand');
  });

  it('shows action on you only on desktop and tablet when the flag is true', () => {
    for (const viewport of [
      [1280, 832],
      [834, 1194],
    ] as const) {
      const shown = renderAtViewport(viewport[0], viewport[1], {
        boardCards: FLOP,
        actionOnYou: true,
      });
      expect(shown.querySelector('[data-field="action-on-you"]')?.textContent).toBe(
        'Action on you',
      );

      const hidden = renderAtViewport(viewport[0], viewport[1], {
        boardCards: FLOP,
        actionOnYou: false,
      });
      expect(hidden.querySelector('[data-field="action-on-you"]')).toBeNull();
    }

    const phone = renderAtViewport(402, 874, {
      boardCards: FLOP,
      actionOnYou: true,
    });
    expect(phone.querySelector('[data-field="action-on-you"]')).toBeNull();
    expect(boardText(phone)).not.toContain('Action on you');
  });

  it('never shows more community cards than supplied', () => {
    const root = renderAtViewport(1280, 832, {
      boardCards: [{ rank: 'A', suit: 'c' }],
    });
    expect(root.querySelector('[data-field="flop-slot-1"]')?.getAttribute('aria-label')).toBe(
      'Ace of Clubs',
    );
    expect(root.querySelector('[data-field="flop-slot-2"]')?.getAttribute('aria-label')).toBe(
      'Empty Flop',
    );
    expect(root.querySelector('[data-field="turn-slot-1"]')?.getAttribute('aria-label')).toBe(
      'Empty Turn',
    );
    expect(root.querySelector('[data-field="river-slot-1"]')?.getAttribute('aria-label')).toBe(
      'Empty River',
    );
  });

  it.each([
    ['desktop', 1280, 832],
    ['tablet', 834, 1194],
    ['phone', 402, 874],
  ])('shows Main and Side pot labels at %s', (_label, width, height) => {
    const root = renderAtViewport(width, height, {
      boardCards: FLOP,
      pots: [
        { label: 'Main', amount: 300 },
        { label: 'Side', amount: 400 },
      ],
    });
    expect(boardText(root)).toContain('Main');
    expect(boardText(root)).toContain('Side');
    expect(boardText(root)).toContain('$300');
    expect(boardText(root)).toContain('$400');
  });

  it('keeps single Pot label when only one pot exists', () => {
    const root = renderAtViewport(1280, 832, {
      boardCards: FLOP,
      pot: 500,
    });
    expect(root.querySelectorAll('[data-field="pot-label"]')).toHaveLength(1);
    expect(root.querySelector('[data-field="pot-label"]')?.textContent).toBe('Pot');
  });
});
