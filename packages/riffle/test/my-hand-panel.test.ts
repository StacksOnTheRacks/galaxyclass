// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  renderMyHandPanel,
  type MyHandPanelViewModel,
} from '../src/client/dashboard/my-hand-panel.js';
import { renderDashboardTableShell } from '../src/client/dashboard/table-shell.js';

const XSS_NAME = '<img src=x onerror=alert(1)>';
const XSS_ACTION = '<script>alert("x")</script>';

const BASE_VIEW: MyHandPanelViewModel = {
  pocketCards: [
    { rank: 'K', suit: 'h' },
    { rank: 'Q', suit: 'd' },
  ],
  bank: 2000,
  sessionDelta: 150,
  committedThisHand: 40,
  madeHand: 'Pair of Kings',
  tier: 'Strong',
  meterFilled: 2,
  outsCount: 6,
  outsPhrase: '6 outs to a full house',
  street: 'Flop',
  actionLog: [
    { displayName: 'Jordan', actionText: 'Check' },
    { displayName: 'Riley', actionText: 'Bet $20' },
  ],
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
    street: 'Flop',
  });
  return root;
}

function renderAtViewport(
  width: number,
  height: number,
  viewModel: MyHandPanelViewModel = BASE_VIEW,
): HTMLElement {
  const root = mountDashboard(width, height);
  const region = root.querySelector('[data-region="my-hand"]') as HTMLElement;
  renderMyHandPanel(region, viewModel);
  return root;
}

function myHandText(root: HTMLElement): string {
  const region = root.querySelector('[data-region="my-hand"]');
  return region?.textContent ?? '';
}

describe('my hand panel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.replaceChildren();
  });

  it.each([
    ['desktop', 1280, 832],
    ['tablet', 834, 1194],
    ['phone', 402, 874],
  ])('renders inside my-hand at %s breakpoint', (_label, width, height) => {
    const root = renderAtViewport(width, height);
    expect(root.dataset.breakpoint).toBe(_label);
    expect(root.querySelector('[data-region="my-hand"] .my-hand-panel')).not.toBeNull();
  });

  it('shows accessible local pocket card names', () => {
    const root = renderAtViewport(1280, 832);
    const faces = root.querySelectorAll('.my-hand-pocket-card');
    expect(faces).toHaveLength(2);
    expect(faces[0]?.getAttribute('aria-label')).toBe('King of Hearts');
    expect(faces[1]?.getAttribute('aria-label')).toBe('Queen of Diamonds');
  });

  it('does not render foreign seat pocket cards', () => {
    const root = renderAtViewport(1280, 832, {
      ...BASE_VIEW,
      foreignPocketCards: [{ rank: 'A', suit: 's' }],
    });

    expect(myHandText(root)).not.toContain('Ace of Spades');
    expect(myHandText(root)).not.toContain('A♠');
    expect(root.querySelectorAll('.my-hand-pocket-card')).toHaveLength(2);
  });

  it('shows no pocket faces when no local cards are supplied', () => {
    const root = renderAtViewport(1280, 832, {
      ...BASE_VIEW,
      pocketCards: [],
    });

    expect(root.querySelector('.my-hand-pocket')).toBeNull();
    expect(root.querySelectorAll('.my-hand-pocket-card')).toHaveLength(0);
  });

  it('shows distinct bank, session, and committed amounts on desktop and tablet', () => {
    for (const viewport of [
      [1280, 832],
      [834, 1194],
    ] as const) {
      const root = renderAtViewport(viewport[0], viewport[1]);
      expect(root.querySelector('[data-field="bank-amount"]')?.textContent).toBe(
        '$2,000',
      );
      expect(root.querySelector('[data-field="session-amount"]')?.textContent).toBe(
        '+$150',
      );
      expect(root.querySelector('[data-field="committed-amount"]')?.textContent).toBe(
        '$40',
      );
      expect(root.querySelector('[data-field="bank-label"]')?.textContent).toBe(
        'Your bank',
      );
      expect(root.querySelector('[data-field="session-label"]')?.textContent).toBe(
        'this session',
      );
      expect(
        root.querySelector('[data-field="committed-label"]')?.textContent,
      ).toBe('committed this hand');
    }
  });

  it('shows bank on phone and omits session, committed, and action log', () => {
    const root = renderAtViewport(402, 874);

    expect(root.querySelector('[data-field="bank-amount"]')?.textContent).toBe(
      '$2,000',
    );
    expect(root.querySelector('[data-field="session"]')).toBeNull();
    expect(root.querySelector('[data-field="committed"]')).toBeNull();
    expect(root.querySelector('[data-field="action-log"]')).toBeNull();
  });

  it('shows made-hand, tier, outs, and hand strength label on desktop and tablet', () => {
    for (const viewport of [
      [1280, 832],
      [834, 1194],
    ] as const) {
      const root = renderAtViewport(viewport[0], viewport[1]);
      expect(root.querySelector('[data-field="strength-label"]')?.textContent).toBe(
        'Hand strength',
      );
      expect(root.querySelector('[data-field="made-hand"]')?.textContent).toBe(
        'Pair of Kings',
      );
      expect(root.querySelector('[data-field="tier"]')?.textContent).toBe('Strong');
      expect(root.querySelector('[data-field="outs-phrase"]')?.textContent).toBe(
        '6 outs to a full house',
      );
    }
  });

  it('shows made-hand, tier, and outs on phone without hand strength label', () => {
    const root = renderAtViewport(402, 874);
    expect(root.querySelector('[data-field="strength-label"]')).toBeNull();
    expect(root.querySelector('[data-field="made-hand"]')?.textContent).toBe(
      'Pair of Kings',
    );
    expect(root.querySelector('[data-field="tier"]')?.textContent).toBe('Strong');
    expect(root.querySelector('[data-field="outs-phrase"]')?.textContent).toContain(
      'outs',
    );
  });

  it('omits strength text when strength is not supplied', () => {
    const root = renderAtViewport(1280, 832, {
      ...BASE_VIEW,
      madeHand: undefined,
      tier: undefined,
      meterFilled: undefined,
      outsPhrase: undefined,
    });

    expect(root.querySelector('[data-field="made-hand"]')).toBeNull();
    expect(root.querySelector('[data-field="tier"]')).toBeNull();
    expect(root.querySelector('[data-field="strength-label"]')).toBeNull();
    expect(root.querySelector('[data-field="meter"]')).toBeNull();
  });

  it('keeps made-hand, tier, and outs readable alongside the meter', () => {
    const root = renderAtViewport(1280, 832);
    expect(root.querySelector('[data-field="made-hand"]')?.textContent).toBeTruthy();
    expect(root.querySelector('[data-field="tier"]')?.textContent).toBeTruthy();
    expect(root.querySelector('[data-field="outs-phrase"]')?.textContent).toContain(
      'outs',
    );
    expect(root.querySelectorAll('.my-hand-meter-segment')).toHaveLength(10);
  });

  it('shows current-street action log on desktop and tablet only', () => {
    const desktop = renderAtViewport(1280, 832);
    expect(
      desktop.querySelector('[data-field="action-log-heading"]')?.textContent,
    ).toBe('Flop action');
    expect(desktop.querySelectorAll('[data-field="action-log-row"]')).toHaveLength(2);

    const phone = renderAtViewport(402, 874);
    expect(phone.querySelector('[data-field="action-log"]')).toBeNull();
  });

  it('does not fabricate action log rows when the log is empty', () => {
    const root = renderAtViewport(1280, 832, {
      ...BASE_VIEW,
      actionLog: [],
    });

    expect(root.querySelector('[data-field="action-log-heading"]')?.textContent).toBe(
      'Flop action',
    );
    expect(root.querySelectorAll('[data-field="action-log-row"]')).toHaveLength(0);
  });

  it('escapes HTML in display names and action text', () => {
    const root = renderAtViewport(1280, 832, {
      ...BASE_VIEW,
      actionLog: [{ displayName: XSS_NAME, actionText: XSS_ACTION }],
    });

    const name = root.querySelector('[data-field="action-log-name"]');
    const action = root.querySelector('[data-field="action-log-action"]');
    expect(name?.textContent).toBe(XSS_NAME);
    expect(action?.textContent).toBe(XSS_ACTION);
    expect(name?.innerHTML).not.toContain('<img');
    expect(action?.innerHTML).not.toContain('<script>');
    expect(root.querySelector('[data-field="action-log"] img')).toBeNull();
    expect(root.querySelector('script')).toBeNull();
  });
});
