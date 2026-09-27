import { createIcon, createVisuallyHidden } from './assets.js';

export const DASHBOARD_TABLE_SHELL_STYLE_ID = 'dashboard-table-shell-styles';

export interface DashboardTableShellProps {
  tableName: string;
  blindsLabel: string;
  seatedPlayersLabel: string;
  handNumber: number | null;
  street: string | null;
  /** Shown only while the viewer holds a seat. */
  onLeaveTable?: () => void;
}

export type DashboardBreakpoint = 'desktop' | 'tablet' | 'phone';

const RESIZE_CLEANUP_KEY = '__dashboardTableShellResizeCleanup';

export function getDashboardBreakpoint(width: number): DashboardBreakpoint {
  if (width >= 1280) {
    return 'desktop';
  }
  if (width >= 834) {
    return 'tablet';
  }
  return 'phone';
}

function formatHandNumber(handNumber: number | null): string {
  return handNumber === null ? 'Hand —' : `Hand #${handNumber}`;
}

function formatStreet(street: string | null): string {
  return street ?? 'Waiting';
}

function createMetaField(
  field: 'table-name' | 'hand-number' | 'blinds' | 'street' | 'players',
  label: string,
  value: string,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'dashboard-meta-field';
  wrapper.dataset.field = field;

  const labelEl = document.createElement('span');
  labelEl.className = 'dashboard-meta-label';
  labelEl.textContent = label;

  const valueEl = document.createElement('span');
  valueEl.className = 'dashboard-meta-value';
  valueEl.textContent = value;

  // The space keeps the accessible/text value readable ("Hand #12"); flex layout ignores it.
  wrapper.append(labelEl, ' ', valueEl);
  return wrapper;
}

function createMetaDot(): HTMLElement {
  return createIcon('dot', 'dashboard-meta-dot');
}

function createControlButton(label: string, className: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}

function createIconButton(label: string, className: string, icon: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `dashboard-icon-button ${className}`;
  button.title = label;
  button.append(createIcon(icon), createVisuallyHidden(label));
  return button;
}

function formatHandValue(handNumber: number | null): string {
  return handNumber === null ? '—' : `#${handNumber}`;
}

function renderTopBar(
  topBar: HTMLElement,
  props: DashboardTableShellProps,
  breakpoint: DashboardBreakpoint,
): void {
  topBar.replaceChildren();
  topBar.className = 'dashboard-top-bar';
  topBar.dataset.region = 'top-bar';
  topBar.setAttribute('role', 'region');
  topBar.setAttribute(
    'aria-label',
    breakpoint === 'phone' ? 'Table header' : 'Top bar',
  );

  const identityRow = document.createElement('div');
  identityRow.className = 'dashboard-top-bar-identity';

  const brand = document.createElement('div');
  brand.className = 'dashboard-brand';

  const tableName = document.createElement('h1');
  tableName.className = 'dashboard-table-name';
  tableName.dataset.field = 'table-name';
  tableName.textContent = props.tableName;

  if (breakpoint !== 'phone') {
    const wordmark = document.createElement('span');
    wordmark.className = 'dashboard-wordmark';
    wordmark.textContent = 'riffle';

    const divider = document.createElement('span');
    divider.className = 'dashboard-brand-divider';
    divider.setAttribute('aria-hidden', 'true');

    const badge = document.createElement('span');
    badge.className = 'dashboard-game-badge';
    badge.textContent = "No-Limit Hold'em";

    brand.append(wordmark, divider, tableName, badge);
  } else {
    brand.append(tableName);
  }

  const controls = document.createElement('div');
  controls.className = 'dashboard-top-bar-controls';

  if (breakpoint === 'phone') {
    controls.append(createIconButton('More', 'dashboard-control-more', 'more'));
  } else {
    controls.append(createIconButton('Settings', 'dashboard-control-settings', 'settings'));
    const { onLeaveTable } = props;
    if (onLeaveTable) {
      const leave = createControlButton('Leave table', 'dashboard-control-leave');
      leave.dataset.field = 'leave-table';
      leave.addEventListener('click', () => onLeaveTable());
      controls.append(leave);
    }
  }

  const metaRow = document.createElement('div');
  metaRow.className = 'dashboard-top-bar-meta';

  if (breakpoint === 'phone') {
    const summary = document.createElement('p');
    summary.className = 'dashboard-hand-summary';
    summary.dataset.field = 'hand-summary';
    summary.textContent = `${formatHandNumber(props.handNumber)} · ${props.blindsLabel} · ${formatStreet(props.street)}`;
    brand.append(summary);
    identityRow.append(brand, controls);
    topBar.append(identityRow);
    return;
  }

  metaRow.append(
    createMetaField('hand-number', 'Hand', formatHandValue(props.handNumber)),
    createMetaDot(),
    createMetaField('blinds', 'Blinds', props.blindsLabel),
    createMetaDot(),
    createMetaField('players', 'Players', props.seatedPlayersLabel),
    createMetaDot(),
    createMetaField('street', 'Street', formatStreet(props.street)),
  );

  if (breakpoint === 'desktop') {
    identityRow.append(brand);
    topBar.append(identityRow, metaRow, controls);
    return;
  }

  identityRow.append(brand, controls);
  topBar.append(identityRow, metaRow);
}

function createRegion(
  region: 'player-row' | 'my-hand' | 'board' | 'actions',
  ariaLabel: string,
): HTMLElement {
  const section = document.createElement('section');
  section.className = `dashboard-region dashboard-region-${region}`;
  section.dataset.region = region;
  section.setAttribute('role', 'region');
  section.setAttribute('aria-label', ariaLabel);
  return section;
}

function updatePlayerRowLabel(playerRow: HTMLElement, breakpoint: DashboardBreakpoint): void {
  playerRow.setAttribute(
    'aria-label',
    breakpoint === 'phone' ? 'Opponents' : 'Player row',
  );
}

function updateActionsRegion(actions: HTMLElement, breakpoint: DashboardBreakpoint): void {
  if (breakpoint === 'phone') {
    actions.dataset.actionsChrome = 'action-sheet';
  } else {
    delete actions.dataset.actionsChrome;
  }
}

function syncRegionOrder(shell: HTMLElement, breakpoint: DashboardBreakpoint): void {
  const topBar = shell.querySelector('[data-region="top-bar"]');
  const playerRow = shell.querySelector('[data-region="player-row"]');
  const myHand = shell.querySelector('[data-region="my-hand"]');
  const board = shell.querySelector('[data-region="board"]');
  const actions = shell.querySelector('[data-region="actions"]');

  if (!topBar || !playerRow || !myHand || !board || !actions) {
    return;
  }

  if (breakpoint === 'desktop') {
    shell.append(topBar, playerRow, myHand, board, actions);
    return;
  }

  shell.append(topBar, playerRow, board, myHand, actions);
}

export function injectDashboardTableShellStyles(css: string): void {
  let style = document.getElementById(DASHBOARD_TABLE_SHELL_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = DASHBOARD_TABLE_SHELL_STYLE_ID;
    document.head.append(style);
  }
  style.textContent = css;
}

export function renderDashboardTableShell(
  root: HTMLElement,
  props: DashboardTableShellProps,
): void {
  const priorCleanup = (root as HTMLElement & Record<string, (() => void) | undefined>)[
    RESIZE_CLEANUP_KEY
  ];
  priorCleanup?.();

  root.replaceChildren();
  root.dataset.surface = 'dashboard';

  const shell = document.createElement('div');
  shell.className = 'dashboard-table-shell';

  const topBar = document.createElement('header');
  const playerRow = createRegion('player-row', 'Player row');
  const myHand = createRegion('my-hand', 'My Hand');
  const board = createRegion('board', 'Board');
  const actions = createRegion('actions', 'Actions');

  shell.append(topBar, playerRow, myHand, board, actions);
  root.append(shell);

  const applyBreakpoint = (): void => {
    const breakpoint = getDashboardBreakpoint(window.innerWidth);
    root.dataset.breakpoint = breakpoint;
    renderTopBar(topBar, props, breakpoint);
    updatePlayerRowLabel(playerRow, breakpoint);
    updateActionsRegion(actions, breakpoint);
    syncRegionOrder(shell, breakpoint);
  };

  applyBreakpoint();

  const onResize = (): void => {
    applyBreakpoint();
  };

  window.addEventListener('resize', onResize);
  (root as HTMLElement & Record<string, (() => void) | undefined>)[RESIZE_CLEANUP_KEY] = () => {
    window.removeEventListener('resize', onResize);
  };
}
