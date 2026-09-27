import type { PlayerSnapshotSeat, TableSnapshotMessage } from '../../runtime/types.js';
import {
  renderActionControls,
  type ActionControlsViewModel,
  type ActionSubmitPayload,
} from '../surfaces/action-controls.js';

export type SeatAction =
  | { action: 'start_hand' | 'leave' }
  | { action: 'fold' | 'check' | 'call' }
  | { action: 'bet' | 'raise'; amount: number };

export function buildActionViewModel(
  snapshot: TableSnapshotMessage,
  local: PlayerSnapshotSeat,
): ActionControlsViewModel {
  const toCall = snapshot.toCall ?? 0;
  const currentBet = snapshot.currentBet ?? 0;
  const allInTo = local.stack + local.committed;
  const canWager = currentBet === 0 || toCall > 0;
  const minRaiseTo = canWager
    ? Math.min(snapshot.minRaiseTo ?? currentBet + 2, allInTo)
    : allInTo + 1;

  return {
    yourTurn: true,
    stack: local.stack,
    toCall,
    minRaiseTo,
    allInTo,
    pot: snapshot.pot,
  };
}

export function toSeatAction(
  payload: ActionSubmitPayload,
  snapshot: TableSnapshotMessage,
): SeatAction {
  if (payload.type === 'raise') {
    const amount = payload.amount ?? 0;
    return (snapshot.currentBet ?? 0) === 0
      ? { action: 'bet', amount }
      : { action: 'raise', amount };
  }
  return { action: payload.type };
}

function statusLine(text: string): HTMLElement {
  const line = document.createElement('p');
  line.className = 'seated-status';
  line.dataset.field = 'seated-status';
  line.setAttribute('role', 'status');
  line.setAttribute('aria-live', 'polite');
  line.textContent = text;
  return line;
}

function button(className: string, field: string, label: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.dataset.field = field;
  element.textContent = label;
  return element;
}

function completeSummary(snapshot: TableSnapshotMessage): HTMLElement {
  const winners = snapshot.seats.filter((seat) => (seat.wonAmount ?? 0) > 0);
  const line = document.createElement('p');
  line.className = 'seated-summary';
  line.dataset.field = 'hand-summary';
  line.textContent = winners.length
    ? `Hand complete · ${winners.map((seat) => `${seat.displayName} wins ${seat.wonAmount}`).join(' · ')}`
    : 'Hand complete';
  return line;
}

export interface SeatedControlsState {
  pending: boolean;
  notice: string | null;
}

export function renderSeatedControls(
  region: HTMLElement,
  snapshot: TableSnapshotMessage,
  local: PlayerSnapshotSeat,
  state: SeatedControlsState,
  send: (action: SeatAction) => void,
): void {
  const handInProgress = snapshot.status === 'hand_in_progress';
  const complete = snapshot.phase === 'complete';

  if (handInProgress && !complete && local.acting && snapshot.phase === 'betting') {
    renderActionControls(region, buildActionViewModel(snapshot, local), {
      onSubmit: (payload) => {
        if (state.pending) {
          return;
        }
        send(toSeatAction(payload, snapshot));
      },
    });
    if (state.notice) {
      region.append(statusLine(state.notice));
    }
    return;
  }

  renderActionControls(region, { yourTurn: false, stack: 0, toCall: 0, minRaiseTo: 0, allInTo: 0, pot: 0 }, {
    onSubmit: () => undefined,
  });

  if (!handInProgress || complete) {
    if (complete) {
      region.append(completeSummary(snapshot));
    }
    const ready = snapshot.seats.filter((seat) => !seat.away && seat.stack > 0).length;
    const busted = local.stack <= 0;
    const enough = ready >= 2 && !busted;

    const deal = button('seated-deal-button', 'deal-hand', complete ? 'Deal next hand' : 'Deal hand');
    deal.disabled = !enough || state.pending;
    deal.addEventListener('click', () => {
      if (!deal.disabled) {
        send({ action: 'start_hand' });
      }
    });

    const leave = leaveButton(state, send);

    const idle = busted
      ? 'Out of chips. Leave your seat and sit again to rebuy.'
      : enough
        ? 'Ready to deal.'
        : 'Waiting for another player to sit.';
    region.append(deal, leave, statusLine(state.notice ?? idle));
    return;
  }

  const acting = snapshot.seats.find((seat) => seat.acting);
  region.append(
    leaveButton(state, send),
    statusLine(state.notice ?? (acting ? `Waiting for ${acting.displayName}` : 'Waiting…')),
  );
}

function leaveButton(state: SeatedControlsState, send: (action: SeatAction) => void): HTMLButtonElement {
  const leave = button('seated-leave-button', 'leave-seat', 'Leave seat');
  leave.disabled = state.pending;
  leave.addEventListener('click', () => {
    if (!leave.disabled) {
      send({ action: 'leave' });
    }
  });
  return leave;
}
