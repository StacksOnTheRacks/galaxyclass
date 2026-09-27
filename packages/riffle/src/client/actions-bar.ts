export type BettingActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export type LegalActionOption = {
  type: BettingActionType;
  amount?: number;
};

export interface ActionsBarOptions {
  enabled: boolean;
  facingBet: boolean;
  legalActions: LegalActionOption[];
  onSubmit: (action: { type: BettingActionType; amount?: number }) => void | Promise<void>;
}

function hasAction(legalActions: LegalActionOption[], type: BettingActionType): boolean {
  return legalActions.some((action) => action.type === type);
}

function defaultAmount(legalActions: LegalActionOption[], type: BettingActionType): number {
  const match = legalActions.find((action) => action.type === type);
  return match?.amount ?? 0;
}

export function renderActionsBar(container: HTMLElement, options: ActionsBarOptions): void {
  container.replaceChildren();
  container.className = 'actions-bar';
  container.dataset.enabled = options.enabled ? 'true' : 'false';

  if (!options.enabled) {
    container.setAttribute('aria-disabled', 'true');
    container.classList.add('actions-bar-disabled');
  }

  const status = document.createElement('p');
  status.className = 'turn-status';
  status.setAttribute('role', 'status');
  status.textContent = options.enabled
    ? 'Your turn · actionable'
    : 'Seat 2 to act · not your turn';
  container.append(status);

  const focusHint = document.createElement('p');
  focusHint.className = 'focus-hint';
  focusHint.textContent =
    'Focus: non-color ring on active control · keyboard operable in iframe';
  container.append(focusHint);

  const controls = document.createElement('div');
  controls.className = 'actions-bar-controls';

  if (options.enabled) {
    const needsAmount =
      hasAction(options.legalActions, 'bet') ||
      hasAction(options.legalActions, 'raise') ||
      hasAction(options.legalActions, 'call');

    if (needsAmount) {
      const amountLabel = document.createElement('label');
      amountLabel.className = 'actions-bar-amount-label';
      amountLabel.textContent = 'Amount';

      const amountInput = document.createElement('input');
      amountInput.type = 'number';
      amountInput.className = 'actions-bar-amount';
      amountInput.id = 'betting-amount';
      amountInput.min = '1';
      amountInput.step = '1';
      amountInput.setAttribute('aria-label', 'Bet or raise amount');

      if (hasAction(options.legalActions, 'call')) {
        amountInput.value = String(defaultAmount(options.legalActions, 'call'));
        amountInput.readOnly = true;
      } else if (hasAction(options.legalActions, 'raise')) {
        amountInput.value = String(defaultAmount(options.legalActions, 'raise'));
      } else if (hasAction(options.legalActions, 'bet')) {
        amountInput.value = String(defaultAmount(options.legalActions, 'bet'));
      }

      amountLabel.append(amountInput);
      controls.append(amountLabel);
    }

    const foldButton = document.createElement('button');
    foldButton.type = 'button';
    foldButton.className = 'action-button action-fold';
    foldButton.textContent = 'Fold';
    foldButton.disabled = !hasAction(options.legalActions, 'fold');
    foldButton.addEventListener('click', () => {
      void options.onSubmit({ type: 'fold' });
    });
    controls.append(foldButton);

    const middleButton = document.createElement('button');
    middleButton.type = 'button';
    middleButton.className = 'action-button action-check-call';
    if (options.facingBet || hasAction(options.legalActions, 'call')) {
      middleButton.textContent = 'Call';
      middleButton.disabled = !hasAction(options.legalActions, 'call');
      middleButton.addEventListener('click', () => {
        void confirmAndSubmit(options, { type: 'call' }, middleButton);
      });
    } else {
      middleButton.textContent = 'Check';
      middleButton.disabled = !hasAction(options.legalActions, 'check');
      middleButton.addEventListener('click', () => {
        void options.onSubmit({ type: 'check' });
      });
    }
    controls.append(middleButton);

    const wagerButton = document.createElement('button');
    wagerButton.type = 'button';
    wagerButton.className = 'action-button action-bet-raise';
    if (options.facingBet || hasAction(options.legalActions, 'raise')) {
      wagerButton.textContent = 'Raise';
      wagerButton.disabled = !hasAction(options.legalActions, 'raise');
      wagerButton.addEventListener('click', () => {
        const amount = defaultAmount(options.legalActions, 'raise');
        void confirmAndSubmit(options, { type: 'raise', amount }, wagerButton);
      });
    } else {
      wagerButton.textContent = 'Bet';
      wagerButton.disabled = !hasAction(options.legalActions, 'bet');
      wagerButton.addEventListener('click', () => {
        const amountInput = container.querySelector<HTMLInputElement>('.actions-bar-amount');
        const amount = Number(amountInput?.value ?? defaultAmount(options.legalActions, 'bet'));
        void confirmAndSubmit(options, { type: 'bet', amount }, wagerButton);
      });
    }
    controls.append(wagerButton);
  } else {
    const disabledNote = document.createElement('p');
    disabledNote.className = 'actions-bar-disabled-note';
    disabledNote.textContent = 'Actions visible but not operable while waiting for your turn';
    controls.append(disabledNote);

    for (const label of ['Fold', options.facingBet ? 'Call' : 'Check', options.facingBet ? 'Raise' : 'Bet']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'action-button action-disabled';
      button.textContent = label;
      button.disabled = true;
      button.tabIndex = -1;
      controls.append(button);
    }
  }

  container.append(controls);
}

async function confirmAndSubmit(
  options: ActionsBarOptions,
  action: { type: BettingActionType; amount?: number },
  button: HTMLButtonElement,
): Promise<void> {
  const confirmed = window.confirm('Confirm irreversible chip commit before send');
  if (!confirmed) {
    button.focus();
    return;
  }
  await options.onSubmit(action);
}

export function renderPotAndStacks(
  container: HTMLElement,
  pot: number,
  stacks: Array<{ seatId: string; stack: number }>,
): void {
  container.replaceChildren();

  const potEl = document.createElement('p');
  potEl.className = 'table-pot';
  potEl.textContent = `Pot ${pot.toLocaleString()}`;
  container.append(potEl);

  const stacksEl = document.createElement('ul');
  stacksEl.className = 'table-stacks';
  stacksEl.setAttribute('aria-label', 'Seat stacks');
  for (const seat of stacks) {
    const item = document.createElement('li');
    item.textContent = `${seat.seatId} · ${seat.stack.toLocaleString()}`;
    stacksEl.append(item);
  }
  container.append(stacksEl);
}
