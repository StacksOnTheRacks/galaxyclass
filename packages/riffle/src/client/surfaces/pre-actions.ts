import { runRegionCleanup, setRegionCleanup } from './action-controls.js';

export type PreActionId = 'check_fold' | 'check' | 'call' | 'call_any';

export interface PreActionOption {
  id: PreActionId;
  label: string;
}

export interface PreActionsViewModel {
  actingName: string | null;
  /** Players still to act before the local seat, including whoever is acting now. */
  actsIn: number | null;
  options: PreActionOption[];
  selected: PreActionId | null;
  armedMessage: string | null;
  clearedMessage: string | null;
}

export interface PreActionsCallbacks {
  onSelect: (id: PreActionId | null) => void;
}

const CHECK_ICON =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function textElement(tag: 'p' | 'span', className: string, text: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export function renderPreActions(
  root: HTMLElement,
  viewModel: PreActionsViewModel,
  callbacks: PreActionsCallbacks,
): void {
  runRegionCleanup(root);
  root.replaceChildren();

  const panel = document.createElement('div');
  panel.className = 'pre-actions-panel';
  panel.dataset.field = 'pre-actions';

  const header = document.createElement('div');
  header.className = 'pre-actions-header';
  const who = textElement(
    'p',
    'pre-actions-who',
    viewModel.actingName ? `Waiting · ${viewModel.actingName} to act` : 'Waiting',
  );
  who.dataset.field = 'pre-actions-waiting';
  header.append(who);
  if (viewModel.actsIn !== null && viewModel.actsIn > 0) {
    const order = textElement('span', 'pre-actions-order', `You act in ${viewModel.actsIn}`);
    order.dataset.field = 'pre-actions-order';
    header.append(order);
  }
  panel.append(header);

  if (!viewModel.selected && !viewModel.clearedMessage) {
    panel.append(
      textElement(
        'p',
        'pre-actions-hint',
        'Pre-select an action — it runs automatically when it’s your turn.',
      ),
    );
  }

  const toggles = document.createElement('div');
  toggles.className = 'pre-actions-toggles';
  toggles.setAttribute('role', 'group');
  toggles.setAttribute('aria-label', 'Pre-select an action');
  for (const option of viewModel.options) {
    const selected = option.id === viewModel.selected;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'pre-action-toggle';
    toggle.dataset.preAction = option.id;
    toggle.setAttribute('aria-pressed', String(selected));
    const box = document.createElement('span');
    box.className = 'pre-action-box';
    box.innerHTML = CHECK_ICON;
    toggle.append(box, textElement('span', 'pre-action-label', option.label));
    toggle.addEventListener('click', () => {
      callbacks.onSelect(selected ? null : option.id);
    });
    toggles.append(toggle);
  }
  panel.append(toggles);

  if (viewModel.selected && viewModel.armedMessage) {
    const banner = document.createElement('div');
    banner.className = 'pre-actions-banner';
    banner.dataset.tone = 'info';
    banner.dataset.field = 'pre-action-armed';
    banner.setAttribute('role', 'status');
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'pre-actions-clear';
    clear.dataset.field = 'pre-action-clear';
    clear.textContent = 'Clear';
    clear.addEventListener('click', () => callbacks.onSelect(null));
    banner.append(textElement('p', '', viewModel.armedMessage), clear);
    panel.append(banner);
  } else if (viewModel.clearedMessage) {
    const banner = document.createElement('div');
    banner.className = 'pre-actions-banner';
    banner.dataset.tone = 'warning';
    banner.dataset.field = 'pre-action-cleared';
    banner.setAttribute('role', 'status');
    banner.append(textElement('p', '', viewModel.clearedMessage));
    panel.append(banner);
  }

  root.append(panel);

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.key !== 'Escape' || !viewModel.selected) {
      return;
    }
    event.preventDefault();
    callbacks.onSelect(null);
  };
  document.addEventListener('keydown', onKeyDown);
  setRegionCleanup(root, () => document.removeEventListener('keydown', onKeyDown));
}
