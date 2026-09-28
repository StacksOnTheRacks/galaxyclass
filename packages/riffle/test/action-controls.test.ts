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
  bigBlind: 20,
};

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height });
  window.dispatchEvent(new Event('resize'));
}

function mountDashboard(width: number, height: number): HTMLElement {
  setViewport(width, height);
  const root = document.createElement('main');
  root.id = 'app';
  document.body.replaceChildren(root);
  renderDashboardTableShell(root, {
    tableName: 'Friday Night',
    blindsLabel: '$10 / $20',
    seatedPlayersLabel: '3 / 8',
    handNumber: 4,
    street: 'Flop',
  });
  return root;
}

type SubmitMock = ReturnType<typeof vi.fn<(payload: ActionSubmitPayload) => void>>;

function renderAtViewport(
  width: number,
  height: number,
  viewModel: ActionControlsViewModel = BASE_VIEW,
): { root: HTMLElement; region: HTMLElement; onSubmit: SubmitMock } {
  const onSubmit = vi.fn<(payload: ActionSubmitPayload) => void>();
  const root = mountDashboard(width, height);
  const region = root.querySelector('[data-region="actions"]') as HTMLElement;
  renderActionControls(region, viewModel, { onSubmit });
  return { root, region, onSubmit };
}

function actionButton(root: HTMLElement, action: string): HTMLButtonElement | null {
  return root.querySelector(`[data-action="${action}"]`);
}

function field<T extends HTMLElement = HTMLElement>(root: HTMLElement, name: string): T | null {
  return root.querySelector<T>(`[data-field="${name}"]`);
}

function presetIds(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>('[data-preset]')].map((node) => node.dataset.preset!);
}

function press(key: string, target: EventTarget = document): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
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
  ])('renders inside actions at %s breakpoint when your turn', (label, width, height) => {
    const { root } = renderAtViewport(width, height);
    expect(root.dataset.breakpoint).toBe(label);
    expect(root.querySelector('[data-region="actions"] [data-field="action-controls"]')).not.toBeNull();
    expect(field(root, 'your-turn')?.textContent).toBe('Your turn');
  });

  it('leaves actions empty when not your turn', () => {
    const { region } = renderAtViewport(1280, 832, { ...BASE_VIEW, yourTurn: false });
    expect(region.children).toHaveLength(0);
  });

  describe('legal buttons only', () => {
    it('facing a bet shows Fold, Call, and Raise without Check', () => {
      const { root } = renderAtViewport(1280, 832);
      expect(actionButton(root, 'fold')?.textContent).toBe('Fold');
      expect(actionButton(root, 'call')?.textContent).toBe('Call $100');
      expect(actionButton(root, 'raise')?.textContent).toBe('Raise');
      expect(actionButton(root, 'check')).toBeNull();
    });

    it('checked to you shows Check and Bet without Fold or Call', () => {
      const { root } = renderAtViewport(1280, 832, { ...BASE_VIEW, toCall: 0, minRaiseTo: 20 });
      expect(actionButton(root, 'check')?.textContent).toBe('Check');
      expect(actionButton(root, 'raise')?.textContent).toBe('Bet');
      expect(actionButton(root, 'fold')).toBeNull();
      expect(actionButton(root, 'call')).toBeNull();
    });

    it('uses Raise when the big blind has the option to check', () => {
      const { root } = renderAtViewport(1280, 832, { ...BASE_VIEW, toCall: 0, wager: 'raise' });
      expect(actionButton(root, 'check')).not.toBeNull();
      expect(actionButton(root, 'raise')?.textContent).toBe('Raise');
    });

    it('turns Call into All-in and hides Raise when the call covers the stack', () => {
      const { root } = renderAtViewport(1280, 832, { ...BASE_VIEW, stack: 80, toCall: 100, allInTo: 80 });
      expect(actionButton(root, 'call')?.textContent).toBe('All-in $80');
      expect(actionButton(root, 'raise')).toBeNull();
      expect(field(root, 'raise-dropup')).toBeNull();
    });

    it('hides Raise when no raise is possible', () => {
      const { root } = renderAtViewport(1280, 832, { ...BASE_VIEW, minRaiseTo: 2500, allInTo: 2000 });
      expect(actionButton(root, 'raise')).toBeNull();
      expect(actionButton(root, 'fold')).not.toBeNull();
    });
  });

  describe('context line', () => {
    it('shows to call, pot, and min raise on desktop', () => {
      const { root } = renderAtViewport(1280, 832);
      expect(field(root, 'to-call')?.textContent).toBe('To call$100');
      expect(field(root, 'hint')?.textContent).toBe('Pot $400 · min raise to $200');
    });

    it('shows min bet when nothing has been wagered', () => {
      const { root } = renderAtViewport(1280, 832, { ...BASE_VIEW, toCall: 0, minRaiseTo: 20 });
      expect(field(root, 'hint')?.textContent).toBe('Pot $400 · min bet $20');
    });

    it('shows only the pot on phone', () => {
      const { root } = renderAtViewport(402, 874);
      expect(field(root, 'hint')?.textContent).toBe('Pot $400');
    });
  });

  describe('sizing drop-up', () => {
    it('starts closed and opens from the trigger without submitting', () => {
      const { root, onSubmit } = renderAtViewport(1280, 832);
      const dropUp = field(root, 'raise-dropup')!;
      const trigger = actionButton(root, 'raise')!;
      expect(dropUp.hidden).toBe(true);
      expect(trigger.getAttribute('aria-expanded')).toBe('false');

      trigger.click();
      expect(dropUp.hidden).toBe(false);
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(onSubmit).not.toHaveBeenCalled();
      expect(field(root, 'raise-amount')?.textContent).toBe('$300');
      expect(field(root, 'raise-confirm')?.textContent).toBe('Raise to $300');

      trigger.click();
      expect(dropUp.hidden).toBe(true);
    });

    it('lists presets in range with ¾ pot selected, and hides ones out of range', () => {
      const wide = renderAtViewport(1280, 832);
      expect(presetIds(wide.root)).toEqual(['min', 'half-pot', 'three-quarter-pot', 'pot', 'all-in']);
      expect(wide.root.querySelector('[data-preset="three-quarter-pot"]')?.getAttribute('aria-pressed')).toBe('true');

      const small = renderAtViewport(1280, 832, { ...BASE_VIEW, pot: 50 });
      expect(presetIds(small.root)).toEqual(['min', 'all-in']);
    });

    it('keeps the same presets on phone and places the drop-up inside the sheet', () => {
      const { root } = renderAtViewport(402, 874);
      expect(presetIds(root)).toContain('min');
      expect(root.querySelector('[data-field="action-controls"] [data-field="raise-dropup"]')).not.toBeNull();
      expect(root.querySelectorAll('[data-field="shortcut"]')).toHaveLength(0);
    });

    it('sets the amount from a preset, then confirms it', () => {
      const { root, onSubmit } = renderAtViewport(1280, 832);
      actionButton(root, 'raise')!.click();
      root.querySelector<HTMLButtonElement>('[data-preset="pot"]')!.click();
      expect(field<HTMLInputElement>(root, 'raise-slider')!.value).toBe('400');
      expect(field<HTMLInputElement>(root, 'raise-input')!.value).toBe('400');
      expect(onSubmit).not.toHaveBeenCalled();

      field<HTMLButtonElement>(root, 'raise-confirm')!.click();
      expect(onSubmit).toHaveBeenCalledWith({ type: 'raise', amount: 400 });
      expect(field(root, 'raise-dropup')!.hidden).toBe(true);
    });

    it('steps by the big blind and snaps slider values to it', () => {
      const { root } = renderAtViewport(1280, 832);
      actionButton(root, 'raise')!.click();
      field<HTMLButtonElement>(root, 'step-up')!.click();
      expect(field(root, 'raise-amount')?.textContent).toBe('$320');
      field<HTMLButtonElement>(root, 'step-down')!.click();
      field<HTMLButtonElement>(root, 'step-down')!.click();
      expect(field(root, 'raise-amount')?.textContent).toBe('$280');

      const slider = field<HTMLInputElement>(root, 'raise-slider')!;
      slider.value = '517';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      expect(field(root, 'raise-amount')?.textContent).toBe('$520');
    });

    it('never steps outside min raise and all-in', () => {
      const { root } = renderAtViewport(1280, 832, { ...BASE_VIEW, pot: 0 });
      actionButton(root, 'raise')!.click();
      field<HTMLButtonElement>(root, 'step-down')!.click();
      expect(field(root, 'raise-amount')?.textContent).toBe('$200');
      root.querySelector<HTMLButtonElement>('[data-preset="all-in"]')!.click();
      field<HTMLButtonElement>(root, 'step-up')!.click();
      expect(field(root, 'raise-amount')?.textContent).toBe('$2,000');
    });

    it('accepts a typed amount, clamps it, and snaps on change', () => {
      const { root } = renderAtViewport(1280, 832);
      actionButton(root, 'raise')!.click();
      const input = field<HTMLInputElement>(root, 'raise-input')!;
      input.value = '$455';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(input.value).toBe('455');
      expect(field(root, 'raise-amount')?.textContent).toBe('$455');
      input.dispatchEvent(new Event('change', { bubbles: true }));
      expect(input.value).toBe('460');

      input.value = '99999';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(field(root, 'raise-amount')?.textContent).toBe('$2,000');
    });

    it('uses Bet copy when nothing has been wagered', () => {
      const { root, onSubmit } = renderAtViewport(1280, 832, { ...BASE_VIEW, toCall: 0, minRaiseTo: 20, pot: 40 });
      actionButton(root, 'raise')!.click();
      expect(field(root, 'raise-dropup')?.textContent).toContain('Bet to');
      expect(field(root, 'raise-confirm')?.textContent).toBe('Bet $30');
      field<HTMLButtonElement>(root, 'raise-confirm')!.click();
      expect(onSubmit).toHaveBeenCalledWith({ type: 'raise', amount: 30 });
    });

    it('closes on Escape and on an outside click without submitting', () => {
      const { root, onSubmit } = renderAtViewport(1280, 832);
      const dropUp = field(root, 'raise-dropup')!;
      actionButton(root, 'raise')!.click();
      press('Escape');
      expect(dropUp.hidden).toBe(true);

      actionButton(root, 'raise')!.click();
      root.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect(dropUp.hidden).toBe(true);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('stays open and keeps the amount across a re-render of the same spot', () => {
      const { root, region, onSubmit } = renderAtViewport(1280, 832);
      actionButton(root, 'raise')!.click();
      root.querySelector<HTMLButtonElement>('[data-preset="pot"]')!.click();
      renderActionControls(region, BASE_VIEW, { onSubmit });
      expect(field(root, 'raise-dropup')!.hidden).toBe(false);
      expect(field(root, 'raise-amount')?.textContent).toBe('$400');

      renderActionControls(region, { ...BASE_VIEW, pot: 600 }, { onSubmit });
      expect(field(root, 'raise-dropup')!.hidden).toBe(true);
    });
  });

  describe('keyboard', () => {
    it.each([
      ['desktop', 1280, 832],
      ['tablet', 834, 1194],
    ])('submits F / K / C and opens the drop-up with R on %s', (_label, width, height) => {
      const { region, onSubmit } = renderAtViewport(width, height);
      press('f');
      expect(onSubmit).toHaveBeenLastCalledWith({ type: 'fold' });
      press('c');
      expect(onSubmit).toHaveBeenLastCalledWith({ type: 'call' });
      press('k');
      expect(onSubmit).toHaveBeenCalledTimes(2);

      press('r');
      expect(field(region, 'raise-dropup')!.hidden).toBe(false);
      press('ArrowUp');
      expect(field(region, 'raise-amount')?.textContent).toBe('$320');
      press('Enter');
      expect(onSubmit).toHaveBeenLastCalledWith({ type: 'raise', amount: 320 });

      renderActionControls(region, { ...BASE_VIEW, toCall: 0, minRaiseTo: 20 }, { onSubmit });
      press('k');
      expect(onSubmit).toHaveBeenLastCalledWith({ type: 'check' });
      press('b');
      expect(field(region, 'raise-dropup')!.hidden).toBe(false);
    });

    it('ignores letter shortcuts while typing an amount', () => {
      const { root, onSubmit } = renderAtViewport(1280, 832);
      actionButton(root, 'raise')!.click();
      press('f', field(root, 'raise-input')!);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('has no shortcuts on phone', () => {
      const { onSubmit } = renderAtViewport(402, 874);
      press('f');
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  it('shows the timer only when one is supplied', () => {
    const withTimer = renderAtViewport(1280, 832, { ...BASE_VIEW, timer: { label: '0:15', fraction: 0.5 } });
    expect(field(withTimer.root, 'timer-row')).not.toBeNull();
    expect(field(withTimer.root, 'timer-label')?.textContent).toBe('0:15');

    const withoutTimer = renderAtViewport(402, 874);
    expect(field(withoutTimer.root, 'timer-row')).toBeNull();
  });

  it('removes document listeners when re-rendered off-turn', () => {
    const { region, onSubmit } = renderAtViewport(1280, 832);
    renderActionControls(region, { ...BASE_VIEW, yourTurn: false }, { onSubmit });
    press('f');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
