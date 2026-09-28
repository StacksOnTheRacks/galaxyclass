import type { PlayerSnapshotSeat, TableSnapshotMessage } from '../../runtime/types.js';
import { formatPlayChips } from '../dashboard/player-row.js';
import type { PreActionId, PreActionOption, PreActionsViewModel } from '../surfaces/pre-actions.js';

export interface ArmedPreAction {
  id: PreActionId;
  /** Amount a "Call $X" pre-action was armed for. */
  callAmount: number | null;
  /** Table bet when armed or last reconciled; a rise means someone bet or raised. */
  currentBet: number;
}

export interface PreActionMemory {
  handNumber: number | null;
  street: TableSnapshotMessage['street'];
  armed: ArmedPreAction | null;
  clearedMessage: string | null;
}

export type PreActionSeatAction = { action: 'fold' | 'check' | 'call' };

export function createPreActionMemory(): PreActionMemory {
  return { handNumber: null, street: null, armed: null, clearedMessage: null };
}

export function preActionOptions(toCall: number): PreActionOption[] {
  if (toCall > 0) {
    return [
      { id: 'check_fold', label: 'Fold' },
      { id: 'call', label: `Call ${formatPlayChips(toCall)}` },
      { id: 'call_any', label: 'Call any' },
    ];
  }
  return [
    { id: 'check_fold', label: 'Check / Fold' },
    { id: 'check', label: 'Check' },
    { id: 'call_any', label: 'Call any' },
  ];
}

function armedMessage(armed: ArmedPreAction, toCall: number): string {
  switch (armed.id) {
    case 'check_fold':
      return toCall > 0
        ? 'Fold is set — you’ll fold when it’s your turn.'
        : 'Check / Fold is set — you’ll check if free, otherwise fold.';
    case 'check':
      return 'Check is set — you’ll check when it’s your turn.';
    case 'call':
      return `Call ${formatPlayChips(armed.callAmount ?? toCall)} is set — you’ll call when it’s your turn.`;
    case 'call_any':
      return 'Call any is set — you’ll call any bet when it’s your turn.';
  }
}

function aggressionSummary(snapshot: TableSnapshotMessage): string {
  const last = [...(snapshot.streetActions ?? [])]
    .reverse()
    .find((entry) => entry.type === 'bet' || entry.type === 'raise');
  const amount = formatPlayChips(last?.amount ?? snapshot.currentBet ?? 0);
  if (!last) {
    return `The bet went up to ${amount}`;
  }
  return last.type === 'bet'
    ? `${last.displayName} bet ${amount}`
    : `${last.displayName} raised to ${amount}`;
}

function armedLabel(armed: ArmedPreAction): string {
  return armed.id === 'check' ? 'Check' : `Call ${formatPlayChips(armed.callAmount ?? 0)}`;
}

/**
 * Keeps the armed pre-action in step with the table: a new hand or street starts clean,
 * and Check / Call $X no longer apply once someone bets or raises.
 */
export function reconcilePreAction(memory: PreActionMemory, snapshot: TableSnapshotMessage): void {
  if (memory.handNumber !== snapshot.handNumber || memory.street !== snapshot.street) {
    memory.handNumber = snapshot.handNumber;
    memory.street = snapshot.street;
    memory.armed = null;
    memory.clearedMessage = null;
    return;
  }
  const armed = memory.armed;
  const currentBet = snapshot.currentBet ?? 0;
  if (!armed || currentBet <= armed.currentBet) {
    return;
  }
  if (armed.id === 'check' || armed.id === 'call') {
    memory.clearedMessage = `${aggressionSummary(snapshot)} — your “${armedLabel(armed)}” pre-action was cleared.`;
    memory.armed = null;
    return;
  }
  armed.currentBet = currentBet;
}

export function armPreAction(
  memory: PreActionMemory,
  id: PreActionId | null,
  snapshot: TableSnapshotMessage,
): void {
  memory.clearedMessage = null;
  memory.armed =
    id === null
      ? null
      : {
          id,
          callAmount: id === 'call' ? (snapshot.toCall ?? 0) : null,
          currentBet: snapshot.currentBet ?? 0,
        };
}

/** The action an armed pre-action takes once it is the local player's turn, if still legal. */
export function resolvePreAction(armed: ArmedPreAction, toCall: number): PreActionSeatAction | null {
  switch (armed.id) {
    case 'check_fold':
      return { action: toCall > 0 ? 'fold' : 'check' };
    case 'check':
      return toCall === 0 ? { action: 'check' } : null;
    case 'call':
      return toCall > 0 && toCall === armed.callAmount ? { action: 'call' } : null;
    case 'call_any':
      return { action: toCall > 0 ? 'call' : 'check' };
  }
}

/** Seats still to act before the local seat, counting the one acting now. */
export function seatsBeforeLocal(snapshot: TableSnapshotMessage): number | null {
  const seats = snapshot.seats;
  const actingIndex = seats.findIndex((seat) => seat.acting);
  const localIndex = seats.findIndex((seat) => seat.isLocal);
  if (actingIndex < 0 || localIndex < 0) {
    return null;
  }
  let count = 0;
  for (let offset = 0; offset < seats.length; offset += 1) {
    const seat = seats[(actingIndex + offset) % seats.length]!;
    if (seat.isLocal) {
      return count;
    }
    if (seat.inHand && !seat.folded && !seat.allIn) {
      count += 1;
    }
  }
  return null;
}

export function canPreAct(snapshot: TableSnapshotMessage, local: PlayerSnapshotSeat): boolean {
  return (
    snapshot.status === 'hand_in_progress' &&
    snapshot.phase === 'betting' &&
    local.inHand &&
    !local.folded &&
    !local.allIn &&
    !local.acting &&
    !local.waitingForNextHand
  );
}

export function buildPreActionsViewModel(
  memory: PreActionMemory,
  snapshot: TableSnapshotMessage,
): PreActionsViewModel {
  const toCall = snapshot.toCall ?? 0;
  return {
    actingName: snapshot.seats.find((seat) => seat.acting)?.displayName ?? null,
    actsIn: seatsBeforeLocal(snapshot),
    options: preActionOptions(toCall),
    selected: memory.armed?.id ?? null,
    armedMessage: memory.armed ? armedMessage(memory.armed, toCall) : null,
    clearedMessage: memory.clearedMessage,
  };
}
