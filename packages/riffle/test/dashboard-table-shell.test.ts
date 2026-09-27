// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  injectDashboardTableShellStyles,
  renderDashboardTableShell,
  type DashboardTableShellProps,
} from '../src/client/dashboard/table-shell.js';

const projectRoot = join(import.meta.dirname, '..');

const BASE_PROPS: DashboardTableShellProps = {
  tableName: 'Friday Night',
  blindsLabel: '$1 / $2',
  seatedPlayersLabel: '6 / 8',
  handNumber: 12,
  street: 'Flop',
};

const XSS_TABLE_NAME = '<img src=x onerror=alert(1)>';

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

function mountRoot(): HTMLElement {
  const root = document.createElement('main');
  root.id = 'app';
  document.body.replaceChildren(root);
  return root;
}

function renderAtViewport(
  width: number,
  height: number,
  props: DashboardTableShellProps = BASE_PROPS,
): HTMLElement {
  setViewport(width, height);
  const root = mountRoot();
  renderDashboardTableShell(root, props);
  return root;
}

function regionNames(root: HTMLElement): string[] {
  return [...root.querySelectorAll('[data-region]')].map(
    (node) => node.getAttribute('data-region') ?? '',
  );
}

describe('dashboard table shell', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.replaceChildren();
    const css = readFileSync(
      join(projectRoot, 'src/client/dashboard/styles.css'),
      'utf8',
    );
    injectDashboardTableShellStyles(css);
  });

  it('renders desktop shell with dashboard regions and meta fields', () => {
    const root = renderAtViewport(1280, 832, { ...BASE_PROPS, onLeaveTable: () => undefined });

    expect(root.dataset.surface).toBe('dashboard');
    expect(root.dataset.breakpoint).toBe('desktop');
    expect(root.querySelector('.table-felt')).toBeNull();
    expect(regionNames(root)).toEqual([
      'top-bar',
      'player-row',
      'my-hand',
      'board',
      'actions',
    ]);

    expect(root.querySelector('[data-field="table-name"]')?.textContent).toBe(
      BASE_PROPS.tableName,
    );
    expect(root.querySelector('[data-field="hand-number"]')?.textContent).toContain(
      'Hand #12',
    );
    expect(root.querySelector('[data-field="blinds"]')?.textContent).toContain(
      '$1 / $2',
    );
    expect(root.querySelector('[data-field="players"]')?.textContent).toContain(
      '6 / 8',
    );
    expect(root.querySelector('[data-field="street"]')?.textContent).toContain('Flop');

    const actions = root.querySelector('[data-region="actions"]');
    expect(actions?.getAttribute('data-actions-chrome')).toBeNull();

    expect(root.querySelector('.dashboard-control-settings')?.textContent).toBe(
      'Settings',
    );
    expect(root.querySelector('.dashboard-control-leave')?.textContent).toBe(
      'Leave table',
    );
    expect(root.querySelector('.dashboard-control-more')).toBeNull();
  });

  it('renders tablet shell with two-row top bar and stacked board before my hand', () => {
    const root = renderAtViewport(834, 1194);

    expect(root.dataset.breakpoint).toBe('tablet');
    expect(root.querySelector('.dashboard-top-bar-identity')).not.toBeNull();
    expect(root.querySelector('.dashboard-top-bar-meta')).not.toBeNull();
    expect(root.querySelector('[data-field="players"]')).not.toBeNull();
    expect(root.querySelector('[data-region="actions"]')?.getAttribute('data-actions-chrome')).toBeNull();

    expect(regionNames(root)).toEqual([
      'top-bar',
      'player-row',
      'board',
      'my-hand',
      'actions',
    ]);
  });

  it('renders phone shell with opponents row and action sheet chrome', () => {
    const root = renderAtViewport(402, 874);

    expect(root.dataset.breakpoint).toBe('phone');
    expect(root.querySelector('[data-field="players"]')).toBeNull();
    expect(root.querySelector('[data-field="hand-summary"]')?.textContent).toBe(
      'Hand #12 · $1 / $2 · Flop',
    );

    const playerRow = root.querySelector('[data-region="player-row"]');
    expect(playerRow?.getAttribute('aria-label')).toBe('Opponents');

    const actions = root.querySelector('[data-region="actions"]');
    expect(actions?.getAttribute('data-actions-chrome')).toBe('action-sheet');
    expect(root.querySelector('.dashboard-control-more')?.textContent).toBe('More');
    expect(root.querySelector('.dashboard-control-settings')).toBeNull();
    expect(root.querySelector('.dashboard-control-leave')).toBeNull();
  });

  it('hides Leave table from spectators who hold no seat', () => {
    const root = renderAtViewport(1280, 832);
    expect(root.querySelector('.dashboard-control-leave')).toBeNull();
    expect(root.querySelector('.dashboard-control-settings')).not.toBeNull();
  });

  it('keeps player row, my hand, board, and actions as empty mounts', () => {
    const root = renderAtViewport(1280, 832);

    for (const region of ['player-row', 'my-hand', 'board', 'actions']) {
      const mount = root.querySelector(`[data-region="${region}"]`);
      expect(mount?.children.length).toBe(0);
    }

    expect(root.textContent).not.toMatch(/Fold|Check|Call|Raise/i);
    expect(root.textContent).not.toMatch(/Pot|Won/i);
  });

  it('omits mic and camera controls at every breakpoint', () => {
    for (const viewport of [
      [1280, 832],
      [834, 1194],
      [402, 874],
    ] as const) {
      const root = renderAtViewport(viewport[0], viewport[1]);
      const text = root.textContent ?? '';
      expect(text).not.toMatch(/Mic|Camera|Muted/i);
      expect(root.querySelector('video')).toBeNull();
      expect(root.querySelector('audio')).toBeNull();
    }
  });

  it('exposes named, focusable top-bar controls that do not open dialogs', () => {
    let leaves = 0;
    const desktop = renderAtViewport(1280, 832, {
      ...BASE_PROPS,
      onLeaveTable: () => {
        leaves += 1;
      },
    });
    const settings = desktop.querySelector(
      '.dashboard-control-settings',
    ) as HTMLButtonElement;
    const leave = desktop.querySelector('.dashboard-control-leave') as HTMLButtonElement;
    expect(settings.tabIndex).toBe(0);
    expect(leave.tabIndex).toBe(0);
    settings.click();
    leave.click();
    expect(leaves).toBe(1);
    expect(document.querySelector('dialog')).toBeNull();

    const phone = renderAtViewport(402, 874);
    const more = phone.querySelector('.dashboard-control-more') as HTMLButtonElement;
    expect(more.tabIndex).toBe(0);
    more.click();
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('renders landmark regions with accessible names', () => {
    const root = renderAtViewport(1280, 832);

    for (const region of root.querySelectorAll('[data-region]')) {
      expect(region.getAttribute('role')).toBe('region');
      expect(region.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('escapes HTML in the table name instead of injecting markup', () => {
    const root = renderAtViewport(1280, 832, {
      ...BASE_PROPS,
      tableName: XSS_TABLE_NAME,
    });

    const tableName = root.querySelector('[data-field="table-name"]');
    expect(tableName?.textContent).toBe(XSS_TABLE_NAME);
    expect(tableName?.querySelector('img')).toBeNull();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });
});
