import type { PlayerSnapshotSeat, TableSnapshotMessage } from '../../runtime/types.js';
import { defaultAvatarUrl } from '../dashboard/assets.js';
import { renderBoardAndPot, type BoardCard } from '../dashboard/board-and-pot.js';
import { renderPlayerRow, type PlayerRowSeat } from '../dashboard/player-row.js';
import { renderDashboardTableShell } from '../dashboard/table-shell.js';

export const DASHBOARD_TABLE_NAME = 'Riffle table';

export function parseCard(card: string): BoardCard {
  return { rank: card.slice(0, -1), suit: card.slice(-1) as BoardCard['suit'] };
}

function toPlayerRowSeat(seat: PlayerSnapshotSeat, snapshot: TableSnapshotMessage): PlayerRowSeat {
  const row: PlayerRowSeat = {
    seatId: seat.seatId,
    displayName: seat.displayName,
    isLocal: seat.isLocal,
    avatarUrl: defaultAvatarUrl(`${snapshot.tableId}:${seat.seatId}:${seat.displayName}`),
    stack: seat.stack,
    inHand: seat.inHand,
    allIn: seat.allIn,
    lastAction: seat.away ? 'Away' : seat.folded ? 'Fold' : null,
    committed: seat.committed,
    position: seat.position,
    acting: seat.acting,
    turnRemainingMs: null,
    turnBudgetMs: null,
    phase: snapshot.phase === 'complete' ? 'complete' : 'betting',
  };
  if (seat.wonAmount !== undefined) {
    row.wonAmount = seat.wonAmount;
  }
  if (seat.holeCards) {
    row.holeCards = seat.holeCards.map(parseCard);
  }
  if (seat.isLocal && seat.acting && snapshot.toCall !== undefined && snapshot.toCall !== null) {
    row.toCall = snapshot.toCall;
  }
  return row;
}

export interface DashboardRegions {
  playerRow: HTMLElement;
  myHand: HTMLElement;
  board: HTMLElement;
  actions: HTMLElement;
}

export function renderSnapshotShell(
  root: HTMLElement,
  snapshot: TableSnapshotMessage,
  onLeaveTable?: () => void,
): DashboardRegions {
  renderDashboardTableShell(root, {
    tableName: DASHBOARD_TABLE_NAME,
    blindsLabel: snapshot.blindsLabel,
    seatedPlayersLabel: snapshot.seatedPlayersLabel,
    handNumber: snapshot.handNumber,
    street: snapshot.street,
    onLeaveTable,
  });

  const region = (name: string): HTMLElement =>
    root.querySelector<HTMLElement>(`[data-region="${name}"]`)!;

  const regions: DashboardRegions = {
    playerRow: region('player-row'),
    myHand: region('my-hand'),
    board: region('board'),
    actions: region('actions'),
  };

  renderPlayerRow(
    regions.playerRow,
    snapshot.seats.map((seat) => toPlayerRowSeat(seat, snapshot)),
  );

  const local = snapshot.seats.find((seat) => seat.isLocal);
  renderBoardAndPot(regions.board, {
    boardCards: (snapshot.board ?? []).map(parseCard),
    pot: snapshot.pot,
    pots: snapshot.pots,
    playersInHand: snapshot.seats.filter((seat) => seat.inHand).length,
    actionOnYou: Boolean(local?.acting),
    phase: snapshot.phase ?? undefined,
  });

  return regions;
}
