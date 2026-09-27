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

const CLEANUP_KEY = '__actionControlsCleanup';

function getDashboardBreakpoint(region: HTMLElement): DashboardBreakpoint {
  const dashboardRoot = region.closest('[data-surface="dashboard"]');
  const breakpoint = dashboardRoot?.getAttribute('data-breakpoint');
  if (breakpoint === 'tablet' || breakpoint === 'phone') {
    return breakpoint;
  }
  return 'desktop';
}

function roundHalfUp(value: number): number {
  return Math.round(value);
}

function potFractionAmount(pot: number, fraction: number): number {
  return roundHalfUp(pot * fraction);
}

function computeInitialRaiseTo(viewModel: ActionControlsViewModel): number {
  const threeQuarterPot = potFractionAmount(viewModel.pot, 0.75);
  if (
    threeQuarterPot >= viewModel.minRaiseTo &&
    threeQuarterPot <= viewModel.allInTo
  ) {
    return threeQuarterPot;
  }
  return viewModel.minRaiseTo;
}

function isPresetEnabled(
  amount: number,
  minRaiseTo: number,
  allInTo: number,
): boolean {
  return amount >= minRaiseTo && amount <= allInTo;
}

function buildPresets(
  viewModel: ActionControlsViewModel,
  includeMin: boolean,
): PresetDefinition[] {
  const presets: PresetDefinition[] = [];

  if (includeMin) {
    presets.push({
      id: 'min',
      label: 'Min',
      amount: viewModel.minRaiseTo,
    });
  }

  presets.push(
    {
      id: 'half-pot',
      label: '½ Pot',
      amount: potFractionAmount(viewModel.pot, 0.5),
    },
    {
      id: 'three-quarter-pot',
      label: '¾ Pot',
      amount: potFractionAmount(viewModel.pot, 0.75),
    },
    {
      id: 'pot',
      label: 'Pot',
      amount: potFractionAmount(viewModel.pot, 1),
    },
    {
      id: 'all-in',
      label: 'All-in',
      amount: viewModel.allInTo,
    },
  );

  return presets;
}

function createActionButton(
  action: ActionSubmitType,
  label: string,
  enabled: boolean,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'action-controls-action-button';
  button.dataset.action = action;
  button.textContent = label;
  button.disabled = !enabled;
  return button;
}

function createShortcutHint(letter: string): HTMLSpanElement {
  const hint = document.createElement('span');
  hint.className = 'action-controls-shortcut';
  hint.dataset.field = 'shortcut';
  hint.textContent = letter;
  return hint;
}

function createAllInDialog(): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.className = 'action-controls-all-in-dialog';
  dialog.dataset.field = 'all-in-dialog';

  const message = document.createElement('p');
  message.dataset.field = 'all-in-message';

  const actions = document.createElement('div');
  actions.className = 'action-controls-all-in-dialog-actions';

  const confirmButton = document.createElement('button');
  confirmButton.type = 'button';
  confirmButton.dataset.field = 'all-in-confirm';
  confirmButton.textContent = 'All-in';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.dataset.field = 'all-in-cancel';
  cancelButton.textContent = 'Cancel';

  actions.append(confirmButton, cancelButton);
  dialog.append(message, actions);
  return dialog;
}

export function renderActionControls(
  root: HTMLElement,
  viewModel: ActionControlsViewModel,
  callbacks: ActionControlsCallbacks,
): void {
  const priorCleanup = (root as HTMLElement & Record<string, (() => void) | undefined>)[
    CLEANUP_KEY
  ];
  priorCleanup?.();

  root.replaceChildren();

  if (!viewModel.yourTurn) {
    return;
  }

  const breakpoint = getDashboardBreakpoint(root);
  const isPhone = breakpoint === 'phone';
  const raiseDisabled = viewModel.minRaiseTo > viewModel.allInTo;
  let raiseTo = computeInitialRaiseTo(viewModel);

  const panel = document.createElement('div');
  panel.className = isPhone ? 'action-controls-sheet' : 'action-controls-panel';
  panel.dataset.field = 'action-controls';

  if (isPhone) {
    const turnHeader = document.createElement('div');
    turnHeader.className = 'action-controls-turn-header';

    const yourTurn = document.createElement('p');
    yourTurn.className = 'action-controls-your-turn';
    yourTurn.dataset.field = 'your-turn';
    yourTurn.textContent = 'Your turn';
    turnHeader.append(yourTurn);

    if (viewModel.timer) {
      const timerRow = document.createElement('div');
      timerRow.className = 'action-controls-timer-row';
      timerRow.dataset.field = 'timer-row';

      const timerLabel = document.createElement('span');
      timerLabel.className = 'action-controls-timer-label';
      timerLabel.dataset.field = 'timer-label';
      timerLabel.textContent = viewModel.timer.label;
      turnHeader.append(timerLabel);

      const progress = document.createElement('div');
      progress.className = 'action-controls-timer-progress';
      progress.dataset.field = 'timer-progress';
      progress.setAttribute('role', 'progressbar');
      const fraction = Math.min(1, Math.max(0, viewModel.timer.fraction));
      progress.setAttribute('aria-valuemin', '0');
      progress.setAttribute('aria-valuemax', '100');
      progress.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
      progress.style.setProperty('--timer-fraction', String(fraction));

      timerRow.append(turnHeader, progress);
      panel.append(timerRow);
    } else {
      panel.append(turnHeader);
    }
  }

  const sizing = document.createElement('div');
  sizing.className = 'action-controls-sizing';

  const amountRow = document.createElement('div');
  amountRow.className = 'action-controls-amount-row';

  const raiseSummary = document.createElement('div');
  raiseSummary.className = 'action-controls-raise-summary';

  const raiseSummaryLabel = document.createElement('span');
  raiseSummaryLabel.className = 'action-controls-raise-label';
  raiseSummaryLabel.textContent = 'Raise to';

  const raiseSummaryAmount = document.createElement('span');
  raiseSummaryAmount.className = 'action-controls-raise-amount';
  raiseSummaryAmount.dataset.field = 'raise-amount';
  raiseSummaryAmount.setAttribute('aria-live', 'polite');

  raiseSummary.append(raiseSummaryLabel, raiseSummaryAmount);
  raiseSummary.hidden = raiseDisabled;
  amountRow.append(raiseSummary);

  const hint = document.createElement('p');
  hint.className = 'action-controls-hint';
  hint.dataset.field = 'hint';

  const updateHint = (): void => {
    if (isPhone) {
      hint.textContent =
        viewModel.toCall > 0 ? `${formatPlayChips(viewModel.toCall)} to call` : '';
      hint.hidden = viewModel.toCall === 0;
      return;
    }

    if (viewModel.toCall > 0) {
      hint.textContent = `${formatPlayChips(viewModel.toCall)} to call · min raise ${formatPlayChips(viewModel.minRaiseTo)}`;
    } else {
      hint.textContent = `min raise ${formatPlayChips(viewModel.minRaiseTo)}`;
    }
  };

  updateHint();
  amountRow.append(hint);
  sizing.append(amountRow);

  const checkEnabled = viewModel.toCall === 0;
  const callEnabled = viewModel.toCall > 0;
  const callLabel = callEnabled
    ? `Call ${formatPlayChips(viewModel.toCall)}`
    : 'Call';

  const buttonsRow = document.createElement('div');
  buttonsRow.className = 'action-controls-buttons';

  const foldButton = createActionButton('fold', 'Fold', true);
  const checkButton = createActionButton('check', 'Check', checkEnabled);
  const callButton = createActionButton('call', callLabel, callEnabled);

  const foldGroup = document.createElement('div');
  foldGroup.className = 'action-controls-button-group';
  foldGroup.append(foldButton);
  if (!isPhone) {
    foldGroup.append(createShortcutHint('F'));
  }

  const checkGroup = document.createElement('div');
  checkGroup.className = 'action-controls-button-group';
  checkGroup.append(checkButton);
  if (!isPhone) {
    checkGroup.append(createShortcutHint('K'));
  }

  const callGroup = document.createElement('div');
  callGroup.className = 'action-controls-button-group';
  callGroup.append(callButton);
  if (!isPhone) {
    callGroup.append(createShortcutHint('C'));
  }

  const raiseGroup = document.createElement('div');
  raiseGroup.className = 'action-controls-button-group';

  const raiseButton = createActionButton(
    'raise',
    `Raise to ${formatPlayChips(raiseTo)}`,
    !raiseDisabled,
  );
  raiseButton.dataset.variant = 'primary';
  raiseGroup.append(raiseButton);
  if (!isPhone) {
    raiseGroup.append(createShortcutHint('R'));
  }

  buttonsRow.append(foldGroup, checkGroup, callGroup, raiseGroup);

  const presetsRow = document.createElement('div');
  presetsRow.className = 'action-controls-presets';
  presetsRow.dataset.field = 'presets';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'action-controls-slider';
  slider.dataset.field = 'raise-slider';
  slider.min = String(viewModel.minRaiseTo);
  slider.max = String(viewModel.allInTo);
  slider.step = '1';
  slider.value = String(raiseTo);
  slider.disabled = raiseDisabled;

  const presetButtons: HTMLButtonElement[] = [];
  const presets = buildPresets(viewModel, !isPhone);

  const updateRaiseLabel = (): void => {
    raiseButton.textContent = `Raise to ${formatPlayChips(raiseTo)}`;
    raiseSummaryAmount.textContent = formatPlayChips(raiseTo);
    const span = viewModel.allInTo - viewModel.minRaiseTo;
    const fill = span > 0 ? ((raiseTo - viewModel.minRaiseTo) / span) * 100 : 100;
    slider.style.setProperty('--fill', `${Math.min(100, Math.max(0, fill)).toFixed(2)}%`);
    const selected = presets.findIndex((preset) => preset.amount === raiseTo);
    presetButtons.forEach((button, index) => {
      if (index === selected && !button.disabled) {
        button.dataset.selected = 'true';
        button.setAttribute('aria-pressed', 'true');
      } else {
        delete button.dataset.selected;
        button.setAttribute('aria-pressed', 'false');
      }
    });
  };

  for (const preset of presets) {
    const presetButton = document.createElement('button');
    presetButton.type = 'button';
    presetButton.className = 'action-controls-preset-button';
    presetButton.dataset.preset = preset.id;
    const enabled = !raiseDisabled && isPresetEnabled(
      preset.amount,
      viewModel.minRaiseTo,
      viewModel.allInTo,
    );
    presetButton.disabled = !enabled;

    if (isPhone) {
      presetButton.textContent = preset.label;
    } else {
      const label = document.createElement('span');
      label.className = 'action-controls-preset-label';
      label.textContent = preset.label;

      const amount = document.createElement('span');
      amount.className = 'action-controls-preset-amount';
      amount.textContent = formatPlayChips(preset.amount);

      presetButton.append(label, amount);
    }

    presetButton.addEventListener('click', () => {
      if (presetButton.disabled) {
        return;
      }
      raiseTo = preset.amount;
      slider.value = String(raiseTo);
      updateRaiseLabel();
    });

    presetButtons.push(presetButton);
    presetsRow.append(presetButton);
  }

  sizing.append(presetsRow, slider);
  panel.append(sizing, buttonsRow);
  updateRaiseLabel();

  const dialog = createAllInDialog();
  panel.append(dialog);
  root.append(panel);

  slider.addEventListener('input', () => {
    raiseTo = Number.parseInt(slider.value, 10);
    updateRaiseLabel();
  });

  const showAllInConfirm = (
    amount: number,
    onConfirm: () => void,
  ): void => {
    const message = dialog.querySelector('[data-field="all-in-message"]');
    if (!(message instanceof HTMLElement)) {
      return;
    }
    message.textContent = `Go all-in for ${formatPlayChips(amount)}?`;

    const confirmButton = dialog.querySelector('[data-field="all-in-confirm"]');
    const cancelButton = dialog.querySelector('[data-field="all-in-cancel"]');
    if (!(confirmButton instanceof HTMLButtonElement)) {
      return;
    }
    if (!(cancelButton instanceof HTMLButtonElement)) {
      return;
    }

    const cleanupDialog = (): void => {
      confirmButton.removeEventListener('click', onConfirmClick);
      cancelButton.removeEventListener('click', onCancelClick);
      dialog.removeEventListener('cancel', onCancelClick);
      if (dialog.open) {
        dialog.close();
      }
    };

    const onConfirmClick = (): void => {
      cleanupDialog();
      onConfirm();
    };

    const onCancelClick = (): void => {
      cleanupDialog();
    };

    confirmButton.addEventListener('click', onConfirmClick);
    cancelButton.addEventListener('click', onCancelClick);
    dialog.addEventListener('cancel', onCancelClick);
    dialog.showModal();
  };

  const needsAllInConfirm = (
    type: ActionSubmitType,
    amount?: number,
  ): boolean => {
    if (type === 'call') {
      return viewModel.toCall >= viewModel.stack;
    }
    if (type === 'raise') {
      return amount === viewModel.stack;
    }
    return false;
  };

  const submitAction = (type: ActionSubmitType, amount?: number): void => {
    if (type === 'check' && !checkEnabled) {
      return;
    }
    if (type === 'call' && !callEnabled) {
      return;
    }
    if (type === 'raise' && raiseDisabled) {
      return;
    }

    const payload: ActionSubmitPayload =
      type === 'raise' ? { type, amount: raiseTo } : { type };

    if (needsAllInConfirm(type, payload.amount)) {
      showAllInConfirm(viewModel.stack, () => {
        callbacks.onSubmit(payload);
      });
      return;
    }

    callbacks.onSubmit(payload);
  };

  foldButton.addEventListener('click', () => {
    submitAction('fold');
  });
  checkButton.addEventListener('click', () => {
    submitAction('check');
  });
  callButton.addEventListener('click', () => {
    submitAction('call');
  });
  raiseButton.addEventListener('click', () => {
    submitAction('raise', raiseTo);
  });

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) {
      return;
    }
    if (isPhone) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === 'f' && !foldButton.disabled) {
      event.preventDefault();
      submitAction('fold');
      return;
    }
    if (key === 'k' && !checkButton.disabled) {
      event.preventDefault();
      submitAction('check');
      return;
    }
    if (key === 'c' && !callButton.disabled) {
      event.preventDefault();
      submitAction('call');
      return;
    }
    if (key === 'r' && !raiseButton.disabled) {
      event.preventDefault();
      submitAction('raise', raiseTo);
    }
  };

  document.addEventListener('keydown', onKeyDown);

  (root as HTMLElement & Record<string, (() => void) | undefined>)[CLEANUP_KEY] = () => {
    document.removeEventListener('keydown', onKeyDown);
    if (dialog.open) {
      dialog.close();
    }
  };
}
