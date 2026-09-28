import { formatPlayChips } from '../dashboard/player-row.js';

export interface ActionControlsTimer {
  label: string;
  fraction: number;
}

export interface ActionControlsViewModel {
  yourTurn: boolean;
  stack: number;
  toCall: number;
  minRaiseTo: number;
  allInTo: number;
  pot: number;
  /** Sizing step for the slider, − / +, and arrow keys. Defaults to 1. */
  bigBlind?: number;
  /** Bet when nobody has wagered this street; raise otherwise. Defaults from toCall. */
  wager?: 'bet' | 'raise';
  timer?: ActionControlsTimer;
}

export type ActionSubmitType = 'fold' | 'check' | 'call' | 'raise';

export interface ActionSubmitPayload {
  type: ActionSubmitType;
  amount?: number;
}

export interface ActionControlsCallbacks {
  onSubmit: (payload: ActionSubmitPayload) => void;
}

type DashboardBreakpoint = 'desktop' | 'tablet' | 'phone';

interface PresetDefinition {
  id: string;
  label: string;
  amount: number;
}

interface SizingMemory {
  key: string;
  open: boolean;
  amount: number;
}

type CleanupHost = HTMLElement & Record<string, unknown>;

const CLEANUP_KEY = '__actionControlsCleanup';
const SIZING_KEY = '__actionControlsSizing';

const CHEVRON_UP =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m18 15-6-6-6 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHEVRON_DOWN =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const MINUS_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
const PLUS_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M12 5v14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';

/** Runs and clears whatever document listeners the last render of this region installed. */
export function runRegionCleanup(root: HTMLElement): void {
  const host = root as CleanupHost;
  const cleanup = host[CLEANUP_KEY] as (() => void) | undefined;
  host[CLEANUP_KEY] = undefined;
  cleanup?.();
}

export function setRegionCleanup(root: HTMLElement, cleanup: () => void): void {
  (root as CleanupHost)[CLEANUP_KEY] = cleanup;
}

export function getDashboardBreakpoint(region: HTMLElement): DashboardBreakpoint {
  const dashboardRoot = region.closest('[data-surface="dashboard"]');
  const breakpoint = dashboardRoot?.getAttribute('data-breakpoint');
  if (breakpoint === 'tablet' || breakpoint === 'phone') {
    return breakpoint;
  }
  return 'desktop';
}

/** Typing into a field must not fire F / K / C / R. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  );
}

function potFractionAmount(pot: number, fraction: number): number {
  return Math.round(pot * fraction);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function computeInitialRaiseTo(viewModel: ActionControlsViewModel): number {
  const threeQuarterPot = potFractionAmount(viewModel.pot, 0.75);
  if (threeQuarterPot >= viewModel.minRaiseTo && threeQuarterPot <= viewModel.allInTo) {
    return threeQuarterPot;
  }
  return viewModel.minRaiseTo;
}

function buildPresets(viewModel: ActionControlsViewModel): PresetDefinition[] {
  const presets: PresetDefinition[] = [
    { id: 'min', label: 'Min', amount: viewModel.minRaiseTo },
    { id: 'half-pot', label: '½ Pot', amount: potFractionAmount(viewModel.pot, 0.5) },
    { id: 'three-quarter-pot', label: '¾ Pot', amount: potFractionAmount(viewModel.pot, 0.75) },
    { id: 'pot', label: 'Pot', amount: potFractionAmount(viewModel.pot, 1) },
    { id: 'all-in', label: 'All-in', amount: viewModel.allInTo },
  ];
  return presets.filter(
    (preset) => preset.amount >= viewModel.minRaiseTo && preset.amount <= viewModel.allInTo,
  );
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function icon(svg: string): HTMLSpanElement {
  const span = element('span', 'action-controls-icon');
  span.innerHTML = svg;
  return span;
}

function createActionButton(action: ActionSubmitType, label: string): HTMLButtonElement {
  const button = element('button', 'action-controls-action-button', label);
  button.type = 'button';
  button.dataset.action = action;
  return button;
}

function createShortcutHint(letter: string): HTMLSpanElement {
  const hint = element('span', 'action-controls-shortcut', letter);
  hint.dataset.field = 'shortcut';
  return hint;
}

function buttonGroup(button: HTMLButtonElement, shortcut: string | null): HTMLDivElement {
  const group = element('div', 'action-controls-button-group');
  group.append(button);
  if (shortcut) {
    group.append(createShortcutHint(shortcut));
  }
  return group;
}

function renderTurnHeader(viewModel: ActionControlsViewModel): HTMLElement {
  const block = element('div', 'action-controls-timer-row');
  const turnHeader = element('div', 'action-controls-turn-header');
  const yourTurn = element('p', 'action-controls-your-turn', 'Your turn');
  yourTurn.dataset.field = 'your-turn';
  turnHeader.append(yourTurn);
  block.append(turnHeader);

  if (viewModel.timer) {
    block.dataset.field = 'timer-row';
    const timerLabel = element('span', 'action-controls-timer-label', viewModel.timer.label);
    timerLabel.dataset.field = 'timer-label';
    turnHeader.append(timerLabel);

    const progress = element('div', 'action-controls-timer-progress');
    progress.dataset.field = 'timer-progress';
    progress.setAttribute('role', 'progressbar');
    const fraction = clamp(viewModel.timer.fraction, 0, 1);
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', '100');
    progress.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    progress.style.setProperty('--timer-fraction', String(fraction));
    block.append(progress);
  }
  return block;
}

function contextHint(
  viewModel: ActionControlsViewModel,
  isPhone: boolean,
  canWager: boolean,
  wager: 'bet' | 'raise',
): string {
  const pot = `Pot ${formatPlayChips(viewModel.pot)}`;
  if (isPhone || !canWager) {
    return pot;
  }
  const min = formatPlayChips(viewModel.minRaiseTo);
  return wager === 'bet' ? `${pot} · min bet ${min}` : `${pot} · min raise to ${min}`;
}

export function renderActionControls(
  root: HTMLElement,
  viewModel: ActionControlsViewModel,
  callbacks: ActionControlsCallbacks,
): void {
  runRegionCleanup(root);
  root.replaceChildren();

  if (!viewModel.yourTurn) {
    (root as CleanupHost)[SIZING_KEY] = undefined;
    return;
  }

  const breakpoint = getDashboardBreakpoint(root);
  const isPhone = breakpoint === 'phone';
  const facingBet = viewModel.toCall > 0;
  const callIsAllIn = facingBet && viewModel.toCall >= viewModel.stack;
  const canWager = viewModel.minRaiseTo <= viewModel.allInTo && !callIsAllIn;
  const wager = viewModel.wager ?? (facingBet ? 'raise' : 'bet');
  const wagerTitle = wager === 'bet' ? 'Bet' : 'Raise';
  const wagerKey = wager === 'bet' ? 'B' : 'R';
  const step = Math.max(1, viewModel.bigBlind ?? 1);

  const sizingKey = [
    viewModel.toCall,
    viewModel.minRaiseTo,
    viewModel.allInTo,
    viewModel.pot,
    wager,
  ].join('|');
  const remembered = (root as CleanupHost)[SIZING_KEY] as SizingMemory | undefined;
  const memory: SizingMemory =
    remembered && remembered.key === sizingKey
      ? remembered
      : { key: sizingKey, open: false, amount: computeInitialRaiseTo(viewModel) };
  (root as CleanupHost)[SIZING_KEY] = memory;

  const panel = element('div', isPhone ? 'action-controls-sheet' : 'action-controls-panel');
  panel.dataset.field = 'action-controls';

  const status = element('div', 'action-controls-status');
  status.append(renderTurnHeader(viewModel));

  const context = element('div', 'action-controls-amount-row');
  const toCallSummary = element('div', 'action-controls-raise-summary');
  toCallSummary.append(
    element('span', 'action-controls-raise-label', 'To call'),
    element('span', 'action-controls-raise-amount', formatPlayChips(viewModel.toCall)),
  );
  toCallSummary.dataset.field = 'to-call';
  const hint = element('p', 'action-controls-hint', contextHint(viewModel, isPhone, canWager, wager));
  hint.dataset.field = 'hint';
  context.append(toCallSummary, hint);
  status.append(context);

  const buttonsRow = element('div', 'action-controls-buttons');
  buttonsRow.dataset.field = 'action-buttons';
  const shortcut = (letter: string): string | null => (isPhone ? null : letter);

  let foldButton: HTMLButtonElement | null = null;
  let checkButton: HTMLButtonElement | null = null;
  let callButton: HTMLButtonElement | null = null;
  let wagerButton: HTMLButtonElement | null = null;

  const passiveRow = isPhone ? element('div', 'action-controls-button-row') : buttonsRow;
  if (facingBet) {
    foldButton = createActionButton('fold', 'Fold');
    callButton = createActionButton(
      'call',
      callIsAllIn
        ? `All-in ${formatPlayChips(viewModel.stack)}`
        : `Call ${formatPlayChips(viewModel.toCall)}`,
    );
    passiveRow.append(buttonGroup(foldButton, shortcut('F')), buttonGroup(callButton, shortcut('C')));
  } else {
    checkButton = createActionButton('check', 'Check');
    passiveRow.append(buttonGroup(checkButton, shortcut('K')));
  }
  if (isPhone) {
    buttonsRow.append(passiveRow);
  }

  const dropUpId = `action-controls-dropup-${Math.random().toString(36).slice(2, 8)}`;
  const dropUp = element('div', 'action-controls-dropup');
  let amount = memory.amount;

  const presets = canWager ? buildPresets(viewModel) : [];
  const presetButtons: Array<{ button: HTMLButtonElement; amount: number }> = [];
  const dropUpAmount = element('span', 'action-controls-raise-amount');
  const amountInput = element('input', 'action-controls-amount-input');
  const slider = element('input', 'action-controls-slider');
  let confirmButton: HTMLButtonElement | null = null;

  const confirmLabel = (): string =>
    wager === 'bet' ? `Bet ${formatPlayChips(amount)}` : `Raise to ${formatPlayChips(amount)}`;

  const snap = (value: number): number => {
    const bounded = clamp(value, viewModel.minRaiseTo, viewModel.allInTo);
    if (bounded === viewModel.minRaiseTo || bounded === viewModel.allInTo) {
      return bounded;
    }
    return clamp(Math.round(bounded / step) * step, viewModel.minRaiseTo, viewModel.allInTo);
  };

  const syncAmount = (options: { writeInput: boolean }): void => {
    memory.amount = amount;
    dropUpAmount.textContent = formatPlayChips(amount);
    if (options.writeInput) {
      amountInput.value = String(amount);
    }
    slider.value = String(amount);
    const span = viewModel.allInTo - viewModel.minRaiseTo;
    const fill = span > 0 ? ((amount - viewModel.minRaiseTo) / span) * 100 : 100;
    slider.style.setProperty('--fill', `${clamp(fill, 0, 100).toFixed(2)}%`);
    for (const preset of presetButtons) {
      const selected = preset.amount === amount;
      if (selected) {
        preset.button.dataset.selected = 'true';
      } else {
        delete preset.button.dataset.selected;
      }
      preset.button.setAttribute('aria-pressed', String(selected));
    }
    if (confirmButton) {
      confirmButton.textContent = confirmLabel();
    }
  };

  const setAmount = (value: number): void => {
    amount = snap(value);
    syncAmount({ writeInput: true });
  };

  const setOpen = (open: boolean): void => {
    memory.open = open;
    dropUp.hidden = !open;
    if (wagerButton) {
      wagerButton.setAttribute('aria-expanded', String(open));
      wagerButton.dataset.open = String(open);
      const chevron = wagerButton.querySelector('.action-controls-icon');
      if (chevron) {
        chevron.innerHTML = open ? CHEVRON_DOWN : CHEVRON_UP;
      }
    }
  };

  const openDropUp = (): void => {
    setOpen(true);
    if (!isPhone) {
      amountInput.focus();
      amountInput.select();
    }
  };

  const closeDropUp = (): void => {
    setOpen(false);
  };

  if (canWager) {
    wagerButton = createActionButton('raise', '');
    wagerButton.dataset.variant = 'primary';
    wagerButton.classList.add('action-controls-wager-trigger');
    wagerButton.setAttribute('aria-haspopup', 'dialog');
    wagerButton.setAttribute('aria-controls', dropUpId);
    wagerButton.append(element('span', 'action-controls-trigger-label', wagerTitle), icon(CHEVRON_UP));
    const wagerGroup = buttonGroup(wagerButton, shortcut(wagerKey));
    wagerGroup.classList.add('action-controls-wager-group');
    buttonsRow.append(wagerGroup);

    dropUp.id = dropUpId;
    dropUp.dataset.field = 'raise-dropup';
    dropUp.setAttribute('role', 'dialog');
    dropUp.setAttribute('aria-label', `${wagerTitle} amount`);

    const header = element('div', 'action-controls-amount-row');
    const summary = element('div', 'action-controls-raise-summary');
    dropUpAmount.dataset.field = 'raise-amount';
    dropUpAmount.setAttribute('aria-live', 'polite');
    summary.append(
      element('span', 'action-controls-raise-label', wager === 'bet' ? 'Bet to' : 'Raise to'),
      dropUpAmount,
    );
    const field = element('label', 'action-controls-amount-field');
    amountInput.type = 'text';
    amountInput.inputMode = 'numeric';
    amountInput.autocomplete = 'off';
    amountInput.dataset.field = 'raise-input';
    amountInput.setAttribute('aria-label', `${wagerTitle} amount in dollars`);
    field.append(element('span', 'action-controls-amount-prefix', '$'), amountInput);
    header.append(summary, field);

    const presetsRow = element('div', 'action-controls-presets');
    presetsRow.dataset.field = 'presets';
    for (const preset of presets) {
      const presetButton = element('button', 'action-controls-preset-button');
      presetButton.type = 'button';
      presetButton.dataset.preset = preset.id;
      presetButton.append(
        element('span', 'action-controls-preset-label', preset.label),
        element('span', 'action-controls-preset-amount', formatPlayChips(preset.amount)),
      );
      presetButton.addEventListener('click', () => {
        amount = preset.amount;
        syncAmount({ writeInput: true });
      });
      presetButtons.push({ button: presetButton, amount: preset.amount });
      presetsRow.append(presetButton);
    }

    slider.type = 'range';
    slider.dataset.field = 'raise-slider';
    slider.min = String(viewModel.minRaiseTo);
    slider.max = String(viewModel.allInTo);
    slider.step = '1';
    slider.setAttribute('aria-label', `${wagerTitle} amount`);

    const stepButton = (name: string, svg: string, delta: number): HTMLButtonElement => {
      const button = element('button', 'action-controls-step-button');
      button.type = 'button';
      button.dataset.field = name;
      button.setAttribute('aria-label', delta > 0 ? `Increase by ${formatPlayChips(step)}` : `Decrease by ${formatPlayChips(step)}`);
      button.append(icon(svg));
      button.addEventListener('click', () => setAmount(amount + delta));
      return button;
    };

    const sliderRow = element('div', 'action-controls-slider-row');
    sliderRow.append(
      stepButton('step-down', MINUS_ICON, -step),
      slider,
      stepButton('step-up', PLUS_ICON, step),
    );
    const range = element('div', 'action-controls-range');
    range.append(
      element('span', '', `Min ${formatPlayChips(viewModel.minRaiseTo)}`),
      element('span', '', `Step ${formatPlayChips(step)} (1 BB)`),
      element('span', '', `Max ${formatPlayChips(viewModel.allInTo)}`),
    );
    const sliderBlock = element('div', 'action-controls-slider-block');
    sliderBlock.append(sliderRow, range);

    confirmButton = createActionButton('raise', confirmLabel());
    confirmButton.dataset.variant = 'primary';
    confirmButton.dataset.field = 'raise-confirm';
    delete confirmButton.dataset.action;
    const confirmGroup = element('div', 'action-controls-button-group');
    confirmGroup.append(confirmButton);
    if (!isPhone) {
      confirmGroup.append(
        element('span', 'action-controls-shortcut', 'Enter to confirm · Esc to close · ↑/↓ to step'),
      );
    }

    dropUp.append(header, presetsRow, sliderBlock, confirmGroup);
    syncAmount({ writeInput: true });

    slider.addEventListener('input', () => {
      amount = snap(Number.parseInt(slider.value, 10));
      syncAmount({ writeInput: true });
    });
    slider.addEventListener('keydown', (event) => {
      const delta =
        event.key === 'ArrowUp' || event.key === 'ArrowRight'
          ? step
          : event.key === 'ArrowDown' || event.key === 'ArrowLeft'
            ? -step
            : 0;
      if (delta !== 0) {
        event.preventDefault();
        event.stopPropagation();
        setAmount(amount + delta);
      }
    });
    amountInput.addEventListener('input', () => {
      const digits = amountInput.value.replace(/[^0-9]/g, '');
      if (digits !== amountInput.value) {
        amountInput.value = digits;
      }
      if (digits === '') {
        return;
      }
      amount = clamp(Number.parseInt(digits, 10), viewModel.minRaiseTo, viewModel.allInTo);
      syncAmount({ writeInput: false });
    });
    amountInput.addEventListener('change', () => setAmount(amount));
  }

  const submit = (payload: ActionSubmitPayload): void => {
    closeDropUp();
    callbacks.onSubmit(payload);
  };
  const submitWager = (): void => {
    amount = clamp(amount, viewModel.minRaiseTo, viewModel.allInTo);
    submit({ type: 'raise', amount });
  };

  foldButton?.addEventListener('click', () => submit({ type: 'fold' }));
  checkButton?.addEventListener('click', () => submit({ type: 'check' }));
  callButton?.addEventListener('click', () => submit({ type: 'call' }));
  wagerButton?.addEventListener('click', () => {
    if (memory.open) {
      closeDropUp();
    } else {
      openDropUp();
    }
  });
  confirmButton?.addEventListener('click', submitWager);

  if (!canWager) {
    panel.append(status, buttonsRow);
    root.prepend(panel);
  } else if (isPhone) {
    panel.append(status, dropUp, buttonsRow);
    root.prepend(panel);
  } else {
    panel.append(status, buttonsRow);
    root.prepend(panel, dropUp);
  }
  setOpen(memory.open);

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) {
      return;
    }
    if (memory.open) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDropUp();
        wagerButton?.focus();
        return;
      }
      if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        submitWager();
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        setAmount(amount + (event.key === 'ArrowUp' ? step : -step));
        return;
      }
    }
    if (isPhone || isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === 'f' && foldButton) {
      event.preventDefault();
      submit({ type: 'fold' });
    } else if (key === 'k' && checkButton) {
      event.preventDefault();
      submit({ type: 'check' });
    } else if (key === 'c' && callButton) {
      event.preventDefault();
      submit({ type: 'call' });
    } else if (key === wagerKey.toLowerCase() && wagerButton) {
      event.preventDefault();
      if (memory.open) {
        closeDropUp();
      } else {
        openDropUp();
      }
    }
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!memory.open || !(event.target instanceof Node)) {
      return;
    }
    if (dropUp.contains(event.target) || wagerButton?.contains(event.target)) {
      return;
    }
    closeDropUp();
  };

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('pointerdown', onPointerDown);
  setRegionCleanup(root, () => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('pointerdown', onPointerDown);
  });
}
