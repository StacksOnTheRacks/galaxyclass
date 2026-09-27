// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  renderActionControls,
  type ActionControlsViewModel,
  type ActionSubmitPayload,
} from '../src/client/surfaces/action-controls.js';
import { renderDashboardTableShell } from '../src/client/dashboard/table-shell.js';

const BASE_VIEW: ActionControlsViewModel = {
  yourTurn: true,
  stack: 2000,
  toCall: 100,
  minRaiseTo: 200,
  allInTo: 2000,
  pot: 400,
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
  viewModel: ActionControlsViewModel = BASE_VIEW,
  onSubmit = vi.fn<(payload: ActionSubmitPayload) => void>(),
): { root: HTMLElement; onSubmit: ReturnType<typeof vi.fn> } {
  const root = mountDashboard(width, height);
  const region = root.querySelector('[data-region="actions"]') as HTMLElement;
  renderActionControls(region, viewModel, { onSubmit });
  return { root, onSubmit };
}

function actionButton(root: HTMLElement, action: string): HTMLButtonElement | null {
  return root.querySelector(`[data-action="${action}"]`);
}

function presetButton(root: HTMLElement, preset: string): HTMLButtonElement | null {
  return root.querySelector(`[data-preset="${preset}"]`);
}

describe('action controls', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.replaceChildren();
  });

  it.each([
    ['desktop', 1280, 832],
    ['tablet', 834, 1194],
    ['phone', 402, 874],
  ])('renders inside actions at %s breakpoint when your turn', (_label, width, height) => {
    const { root } = renderAtViewport(width, height);
    expect(root.dataset.breakpoint).toBe(_label);
    expect(root.querySelector('[data-region="actions"] [data-field="action-controls"]')).not.toBeNull();
  });

  it.each([
    ['desktop', 1280, 832],
    ['tablet', 834, 1194],
    ['phone', 402, 874],
  ])('leaves actions empty when not your turn at %s', (_label, width, height) => {
    const { root } = renderAtViewport(width, height, { ...BASE_VIEW, yourTurn: false });
    expect(root.querySelector('[data-region="actions"]')?.children).toHaveLength(0);
  });

  it('enables fold always and toggles check and call from toCall', () => {
    const facingBet = renderAtViewport(1280, 832);
    expect(actionButton(facingBet.root, 'fold')?.disabled).toBe(false);
    expect(actionButton(facingBet.root, 'check')?.disabled).toBe(true);
    expect(actionButton(facingBet.root, 'check')?.textContent).toBe('Check');
    expect(actionButton(facingBet.root, 'call')?.disabled).toBe(false);
    expect(actionButton(facingBet.root, 'call')?.textContent).toBe('Call $100');

    const noBet = renderAtViewport(1280, 832, { ...BASE_VIEW, toCall: 0 });
    expect(actionButton(noBet.root, 'check')?.disabled).toBe(false);
    expect(actionButton(noBet.root, 'call')?.disabled).toBe(true);
    expect(actionButton(noBet.root, 'call')?.textContent).toBe('Call');
  });

  it('shows raise controls with desktop presets including Min amounts', () => {
    const { root } = renderAtViewport(1280, 832);
    expect(actionButton(root, 'raise')?.textContent).toBe('Raise to $300');
    expect(presetButton(root, 'min')).not.toBeNull();
    expect(presetButton(root, 'min')?.textContent).toContain('Min');
    expect(presetButton(root, 'min')?.textContent).toContain('$200');
    expect(root.querySelector('[data-field="raise-slider"]')).not.toBeNull();
  });

  it('omits Min preset and shortcut hints on phone', () => {
    const { root } = renderAtViewport(402, 874);
    expect(presetButton(root, 'min')).toBeNull();
    expect(root.querySelectorAll('[data-field="shortcut"]')).toHaveLength(0);
    expect(root.querySelector('[data-field="your-turn"]')?.textContent).toBe('Your turn');
  });

  it('updates slider from preset click without submitting', () => {
    const { root, onSubmit } = renderAtViewport(1280, 832);
    const slider = root.querySelector('[data-field="raise-slider"]') as HTMLInputElement;
    presetButton(root, 'pot')?.click();
    expect(slider.value).toBe('400');
    expect(actionButton(root, 'raise')?.textContent).toBe('Raise to $400');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not update slider from a disabled preset', () => {
    const { root } = renderAtViewport(1280, 832, {
      ...BASE_VIEW,
      pot: 50,
      minRaiseTo: 200,
      allInTo: 2000,
    });
    const slider = root.querySelector('[data-field="raise-slider"]') as HTMLInputElement;
    const initialValue = slider.value;
    const halfPot = presetButton(root, 'half-pot');
    expect(halfPot?.disabled).toBe(true);
    halfPot?.click();
    expect(slider.value).toBe(initialValue);
  });

  it('submits enabled actions with expected payloads', () => {
    const { root, onSubmit } = renderAtViewport(1280, 832);
    actionButton(root, 'fold')?.click();
    expect(onSubmit).toHaveBeenLastCalledWith({ type: 'fold' });

    renderActionControls(
      root.querySelector('[data-region="actions"]') as HTMLElement,
      { ...BASE_VIEW, toCall: 0 },
      { onSubmit },
    );
    actionButton(root, 'check')?.click();
    expect(onSubmit).toHaveBeenLastCalledWith({ type: 'check' });

    renderActionControls(
      root.querySelector('[data-region="actions"]') as HTMLElement,
      BASE_VIEW,
      { onSubmit },
    );
    actionButton(root, 'call')?.click();
    expect(onSubmit).toHaveBeenLastCalledWith({ type: 'call' });

    renderActionControls(
      root.querySelector('[data-region="actions"]') as HTMLElement,
      BASE_VIEW,
      { onSubmit },
    );
    actionButton(root, 'raise')?.click();
    expect(onSubmit).toHaveBeenLastCalledWith({ type: 'raise', amount: 300 });
  });

  it('does not submit disabled check or call', () => {
    const { root, onSubmit } = renderAtViewport(1280, 832);
    actionButton(root, 'check')?.click();
    expect(onSubmit).not.toHaveBeenCalled();

    renderActionControls(
      root.querySelector('[data-region="actions"]') as HTMLElement,
      { ...BASE_VIEW, toCall: 0 },
      { onSubmit },
    );
    actionButton(root, 'call')?.click();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows all-in confirm for call and cancels without submit', () => {
    const { root, onSubmit } = renderAtViewport(1280, 832, {
      ...BASE_VIEW,
      stack: 100,
      toCall: 100,
    });
    actionButton(root, 'call')?.click();
    expect(root.querySelector('[data-field="all-in-dialog"]')?.textContent).toContain(
      'Go all-in for $100?',
    );
    root.querySelector('[data-field="all-in-cancel"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('confirms all-in call and submits', () => {
    const { root, onSubmit } = renderAtViewport(1280, 832, {
      ...BASE_VIEW,
      stack: 100,
      toCall: 100,
    });
    actionButton(root, 'call')?.click();
    root.querySelector('[data-field="all-in-confirm"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onSubmit).toHaveBeenCalledWith({ type: 'call' });
  });

  it('shows all-in confirm when raise-to equals stack', () => {
    const { root, onSubmit } = renderAtViewport(1280, 832, {
      ...BASE_VIEW,
      stack: 300,
      minRaiseTo: 200,
      allInTo: 2000,
      pot: 400,
    });
    const slider = root.querySelector('[data-field="raise-slider"]') as HTMLInputElement;
    slider.value = '300';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    actionButton(root, 'raise')?.click();
    expect(root.querySelector('[data-field="all-in-message"]')?.textContent).toBe(
      'Go all-in for $300?',
    );
    root.querySelector('[data-field="all-in-cancel"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('activates desktop and tablet keyboard shortcuts for enabled controls', () => {
    for (const viewport of [
      [1280, 832],
      [834, 1194],
    ] as const) {
      const { root, onSubmit } = renderAtViewport(viewport[0], viewport[1]);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
      expect(onSubmit).toHaveBeenLastCalledWith({ type: 'fold' });

      renderActionControls(
        root.querySelector('[data-region="actions"]') as HTMLElement,
        { ...BASE_VIEW, toCall: 0 },
        { onSubmit },
      );
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }));
      expect(onSubmit).toHaveBeenLastCalledWith({ type: 'check' });

      renderActionControls(
        root.querySelector('[data-region="actions"]') as HTMLElement,
        BASE_VIEW,
        { onSubmit },
      );
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
      expect(onSubmit).toHaveBeenLastCalledWith({ type: 'call' });

      renderActionControls(
        root.querySelector('[data-region="actions"]') as HTMLElement,
        BASE_VIEW,
        { onSubmit },
      );
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
      expect(onSubmit).toHaveBeenLastCalledWith({ type: 'raise', amount: 300 });
    }
  });

  it('shows phone timer row only when timer is supplied', () => {
    const withTimer = renderAtViewport(402, 874, {
      ...BASE_VIEW,
      timer: { label: '0:15', fraction: 0.5 },
    });
    expect(withTimer.root.querySelector('[data-field="timer-row"]')).not.toBeNull();
    expect(withTimer.root.querySelector('[data-field="timer-label"]')?.textContent).toBe('0:15');

    const withoutTimer = renderAtViewport(402, 874);
    expect(withoutTimer.root.querySelector('[data-field="timer-row"]')).toBeNull();
  });

  it('shows desktop hint with to call and min raise, phone hint only when facing a bet', () => {
    const desktop = renderAtViewport(1280, 832);
    expect(desktop.root.querySelector('[data-field="hint"]')?.textContent).toBe(
      '$100 to call · min raise $200',
    );

    const desktopNoBet = renderAtViewport(1280, 832, { ...BASE_VIEW, toCall: 0 });
    expect(desktopNoBet.root.querySelector('[data-field="hint"]')?.textContent).toBe(
      'min raise $200',
    );

    const phone = renderAtViewport(402, 874);
    expect(phone.root.querySelector('[data-field="hint"]')?.textContent).toBe('$100 to call');

    const phoneNoBet = renderAtViewport(402, 874, { ...BASE_VIEW, toCall: 0 });
    expect(phoneNoBet.root.querySelector('[data-field="hint"]')?.hidden).toBe(true);
  });

  it('disables raise slider and presets when minRaiseTo exceeds allInTo', () => {
    const { root } = renderAtViewport(1280, 832, {
      ...BASE_VIEW,
      minRaiseTo: 2500,
      allInTo: 2000,
    });
    expect(actionButton(root, 'raise')?.disabled).toBe(true);
    expect(root.querySelector('[data-field="raise-slider"]')?.hasAttribute('disabled')).toBe(true);
    for (const preset of root.querySelectorAll('[data-preset]')) {
      expect((preset as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('exposes visible accessible names on action buttons', () => {
    const { root } = renderAtViewport(1280, 832);
    for (const action of ['fold', 'check', 'call', 'raise']) {
      const button = actionButton(root, action);
      expect(button?.textContent?.trim().length).toBeGreaterThan(0);
    }
  });
});
