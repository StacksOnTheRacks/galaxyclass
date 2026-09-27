import type {
  PlayerSnapshotSeat,
  SnapshotStreetAction,
  TableSnapshotMessage,
} from '../../runtime/types.js';
import { evaluateHandStrength } from '../dashboard/hand-strength.js';
import type { MyHandActionLogEntry, MyHandPanelViewModel } from '../dashboard/my-hand-panel.js';
import { formatPlayChips } from '../dashboard/player-row.js';
import { parseCard } from './view.js';

export function formatStreetAction(entry: SnapshotStreetAction): string {
  const amount = formatPlayChips(entry.amount ?? 0);
  if (entry.allIn && entry.type !== 'fold' && entry.type !== 'check') {
    return `all in for ${amount}`;
  }
  switch (entry.type) {
    case 'fold':
      return 'folded';
    case 'check':
      return 'checked';
    case 'call':
      return `called ${amount}`;
    case 'bet':
      return `bet ${amount}`;
    case 'raise':
      return `raised to ${amount}`;
  }
}

function streetLabel(street: string): string {
  return street.charAt(0).toUpperCase() + street.slice(1);
}

export function buildMyHandViewModel(
  snapshot: TableSnapshotMessage,
  local: PlayerSnapshotSeat,
): MyHandPanelViewModel {
  const inHand = snapshot.status === 'hand_in_progress';
  const viewModel: MyHandPanelViewModel = {
    pocketCards: snapshot.pocketCards?.map(parseCard),
    bank: local.stack,
    committedThisHand: inHand ? local.committed : undefined,
  };

  if (inHand && snapshot.pocketCards) {
    Object.assign(
      viewModel,
      evaluateHandStrength(snapshot.pocketCards, snapshot.board ?? [], snapshot.street),
    );
  }

  if (inHand && snapshot.street) {
    viewModel.street = streetLabel(snapshot.street);
    viewModel.actionLog = (snapshot.streetActions ?? []).map(
      (entry): MyHandActionLogEntry => ({
        displayName: entry.displayName,
        actionText: formatStreetAction(entry),
      }),
    );
  }

  return viewModel;
}
