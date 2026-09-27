import { describe, expect, it } from 'vitest';
import {
  buildMyHandViewModel,
  formatStreetAction,
} from '../src/client/dashboard-play/my-hand-view.js';
import type { PlayerSnapshotSeat, TableSnapshotMessage } from '../src/runtime/types.js';

const LOCAL: PlayerSnapshotSeat = {
  seatId: '1',
  displayName: 'Me',
  isLocal: true,
  stack: 2180,
  inHand: true,
  committed: 40,
  position: null,
  acting: false,
  folded: false,
};

const SNAPSHOT: TableSnapshotMessage = {
  type: 'table_snapshot',
  tableId: 't',
  version: 9,
  status: 'hand_in_progress',
  createdAt: '2026-09-27T12:00:00.000Z',
  handNumber: 3,
  street: 'turn',
  blindsLabel: '$1 / $2',
  seatedPlayersLabel: '5 / 8',
  pot: 200,
  buttonSeatId: '2',
  currentSeatId: '1',
  board: ['Kd', '7c', '2s', '9d'],
  seats: [LOCAL],
  pocketCards: ['Kh', '7h'],
  streetActions: [
    { seatId: '2', displayName: 'Johnny Chan', type: 'raise', amount: 40 },
    { seatId: '3', displayName: 'Priya S.', type: 'fold' },
    { seatId: '4', displayName: 'Leo M.', type: 'call', amount: 40 },
    { seatId: '5', displayName: 'Sam K.', type: 'call', amount: 40 },
  ],
};

describe('my hand view model', () => {
  it('builds strength and turn action from the snapshot', () => {
    const viewModel = buildMyHandViewModel(SNAPSHOT, LOCAL);
    expect(viewModel).toMatchObject({
      bank: 2180,
      committedThisHand: 40,
      madeHand: 'Two Pair, Kings & Sevens',
      tier: 'Strong',
      meterFilled: 3,
      outsCount: 4,
      outsPhrase: 'Improves to a full house on the river',
      street: 'Turn',
      actionLog: [
        { displayName: 'Johnny Chan', actionText: 'raised to $40' },
        { displayName: 'Priya S.', actionText: 'folded' },
        { displayName: 'Leo M.', actionText: 'called $40' },
        { displayName: 'Sam K.', actionText: 'called $40' },
      ],
    });
  });

  it('omits strength and action log between hands', () => {
    const viewModel = buildMyHandViewModel(
      { ...SNAPSHOT, status: 'open', street: null, pocketCards: undefined, streetActions: undefined },
      LOCAL,
    );
    expect(viewModel.madeHand).toBeUndefined();
    expect(viewModel.actionLog).toBeUndefined();
    expect(viewModel.committedThisHand).toBeUndefined();
  });

  it('formats checks, bets, and all-ins', () => {
    expect(formatStreetAction({ seatId: '1', displayName: 'A', type: 'check' })).toBe('checked');
    expect(formatStreetAction({ seatId: '1', displayName: 'A', type: 'bet', amount: 20 })).toBe(
      'bet $20',
    );
    expect(
      formatStreetAction({ seatId: '1', displayName: 'A', type: 'call', amount: 1500, allIn: true }),
    ).toBe('all in for $1,500');
  });
});
