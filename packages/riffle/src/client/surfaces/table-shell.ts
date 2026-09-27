export interface PublicTableSeat {
  seatId: string;
  playerSubject: string | null;
  displayName: string | null;
  stack: number;
}

export interface TableShellContext {
  matchId: string;
  seatId?: string;
  seats?: PublicTableSeat[];
  onEditDisplayName?: () => void;
  onLeaveTable?: () => void;
}

export function formatPublicSeatLabel(seat: PublicTableSeat, index: number): string {
  const seatNumber = index + 1;
  if (seat.playerSubject === null) {
    return `Seat ${seatNumber} · open`;
  }
  if (seat.displayName) {
    return `Seat ${seatNumber} · ${seat.displayName}`;
  }
  return `Seat ${seatNumber} · seated`;
}

export function renderTableShell(root: HTMLElement, context: TableShellContext): void {
  root.replaceChildren();
  root.dataset.surface = 'table-shell';
  root.dataset.matchId = context.matchId;

  const shell = document.createElement('section');
  shell.className = 'surface surface-table-shell';
  shell.setAttribute('role', 'region');
  shell.setAttribute('aria-label', 'Poker table waiting for deal');

  const felt = document.createElement('div');
  felt.className = 'table-felt';
  felt.setAttribute('aria-hidden', 'true');

  const seatList = document.createElement('div');
  seatList.className = 'table-seat-list';
  seatList.setAttribute('role', 'group');
  seatList.setAttribute('aria-label', 'Table seats');

  const seats = context.seats ?? [];
  if (seats.length > 0) {
    for (const [index, seat] of seats.entries()) {
      const rosterLabel = document.createElement('p');
      rosterLabel.className = 'table-seat-label';
      if (context.seatId && seat.seatId === context.seatId) {
        rosterLabel.dataset.ownSeat = '1';
      }
      rosterLabel.textContent = formatPublicSeatLabel(seat, index);
      seatList.append(rosterLabel);
    }
    felt.append(seatList);
  }

  const playerSeat = document.createElement('div');
  playerSeat.className = 'player-seat player-seat-you';

  const seatLabel = document.createElement('span');
  seatLabel.className = 'player-seat-label';
  seatLabel.textContent = 'YOU';

  const holeArea = document.createElement('div');
  holeArea.className = 'hole-area';
  holeArea.setAttribute('role', 'group');
  holeArea.setAttribute('aria-label', 'Your hole cards, seat-private, empty');

  const holeCards = document.createElement('div');
  holeCards.className = 'hole-cards hole-cards-empty';
  holeCards.setAttribute('aria-hidden', 'true');

  holeArea.append(holeCards);
  playerSeat.append(seatLabel, holeArea);

  const header = document.createElement('header');
  header.className = 'table-header';

  const title = document.createElement('h1');
  title.className = 'surface-title';
  title.textContent = 'Waiting for deal';

  const match = document.createElement('p');
  match.className = 'table-match-id';
  match.textContent = `Match ${context.matchId}`;

  const status = document.createElement('p');
  status.className = 'table-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = 'The host will start the hand soon.';

  header.append(title, match, status);

  const footer = document.createElement('footer');
  footer.className = 'table-shell-footer';

  if (context.seatId) {
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'action-button table-edit-display-name';
    editButton.textContent = 'Edit display name';
    editButton.addEventListener('click', () => {
      context.onEditDisplayName?.();
    });
    footer.append(editButton);
  }

  const leaveButton = document.createElement('button');
  leaveButton.type = 'button';
  leaveButton.className = 'action-button action-leave-table';
  leaveButton.textContent = 'Leave table';
  leaveButton.addEventListener('click', () => {
    context.onLeaveTable?.();
  });

  footer.append(leaveButton);
  shell.append(felt, playerSeat, header, footer);
  root.append(shell);
}
