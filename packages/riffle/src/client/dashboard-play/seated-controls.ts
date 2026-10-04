import type { PlayerSnapshotSeat, TableSnapshotMessage } from '../../runtime/types.js';
import { formatPlayChips } from '../dashboard/player-row.js';
import {
  renderActionControls,
  type ActionControlsViewModel,
  type ActionSubmitPayload,
} from '../surfaces/action-controls.js';
import { renderPreActions } from '../surfaces/pre-actions.js';
import {
  armPreAction,
  buildPreActionsViewModel,
  canPreAct,
  createPreActionMemory,
  reconcilePreAction,
  resolvePreAction,
  type PreActionMemory,
} from './pre-action-state.js';

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
    bigBlind: snapshot.bigBlind,
    wager: currentBet === 0 ? 'bet' : 'raise',
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

function completeSummary(snapshot: TableSnapshotMessage): HTMLElement {
  const winners = snapshot.seats.filter((seat) => (seat.wonAmount ?? 0) > 0);
  const line = document.createElement('p');
  line.className = 'seated-summary';
  line.dataset.field = 'hand-summary';
  line.textContent = winners.length
    ? `Hand complete · ${winners
        .map((seat) => {
          const hand = seat.wonHandLabel ? ` with ${seat.wonHandLabel}` : '';
          return `${seat.displayName} wins ${formatPlayChips(seat.wonAmount ?? 0)}${hand}`;
        })
        .join(' · ')}`
    : 'Hand complete';
  return line;
}

export interface SeatedControlsState {
  pending: boolean;
  notice: string | null;
  preActions?: PreActionMemory;
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
  const preActions = (state.preActions ??= createPreActionMemory());
  reconcilePreAction(preActions, snapshot);

  if (handInProgress && !complete && local.acting && snapshot.phase === 'betting') {
    const armed = preActions.armed;
    preActions.clearedMessage = null;
    if (armed && !state.pending) {
      preActions.armed = null;
      const action = resolvePreAction(armed, snapshot.toCall ?? 0);
      if (action) {
        send(action);
      }
    }
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
    const enough = ready >= 2;

    const idle = busted
      ? 'Out of chips. Leave the table and rejoin to rebuy.'
      : complete && enough
        ? 'Next hand starts in a moment.'
        : enough
          ? 'Dealing…'
          : 'Waiting for another player to sit.';
    region.append(statusLine(state.notice ?? idle));
    return;
  }

  if (local.waitingForNextHand) {
    region.append(statusLine(state.notice ?? WAITING_FOR_NEXT_HAND));
    return;
  }

  if (canPreAct(snapshot, local)) {
    renderPreActions(region, buildPreActionsViewModel(preActions, snapshot), {
      onSelect: (id) => {
        const focused = (document.activeElement as HTMLElement | null)?.dataset?.preAction;
        armPreAction(preActions, id, snapshot);
        renderSeatedControls(region, snapshot, local, state, send);
        if (focused) {
          region.querySelector<HTMLElement>(`[data-pre-action="${focused}"]`)?.focus();
        }
      },
    });
    if (state.notice) {
      region.append(statusLine(state.notice));
    }
    return;
  }

  const acting = snapshot.seats.find((seat) => seat.acting);
  region.append(statusLine(state.notice ?? (acting ? `Waiting for ${acting.displayName}` : 'Waiting…')));
}

export const WAITING_FOR_NEXT_HAND = 'Waiting for the next hand';
