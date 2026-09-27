export interface PublicTableSeat {
  seatId: string;
  playerSubject: string | null;
  displayName: string | null;
  stack: number;
}

export interface UnseatedContext {
  matchId: string;
  seats: PublicTableSeat[];
  sitFailed?: boolean;
  onSit?: () => void;
}

function formatSeatLabel(seat: PublicTableSeat, index: number): string {
  const seatNumber = index + 1;
  if (seat.playerSubject === null) {
    return `Seat ${seatNumber} · open`;
  }
  return `Seat ${seatNumber} · seated`;
}

export function renderUnseated(root: HTMLElement, context: UnseatedContext): void {
  root.replaceChildren();
  root.dataset.surface = 'unseated';
  root.dataset.matchId = context.matchId;

  const shell = document.createElement('section');
  shell.className = 'surface surface-unseated';
  shell.setAttribute('role', 'region');
  shell.setAttribute('aria-label', 'Poker table, unseated');

  const felt = document.createElement('div');
  felt.className = 'table-felt';
  felt.setAttribute('aria-hidden', 'true');

  const street = document.createElement('p');
  street.className = 'unseated-street';
  street.textContent = 'Between hands';

  const boardArea = document.createElement('div');
  boardArea.className = 'board-area';
  boardArea.append(street);

  const seatList = document.createElement('div');
  seatList.className = 'unseated-seat-list';
  seatList.setAttribute('role', 'group');
  seatList.setAttribute('aria-label', 'Open seats');

  for (const [index, seat] of context.seats.entries()) {
    const seatLabel = document.createElement('p');
    seatLabel.className = 'unseated-seat-label';
    seatLabel.textContent = formatSeatLabel(seat, index);
    seatList.append(seatLabel);
  }

  const pot = document.createElement('p');
  pot.className = 'unseated-pot';
  pot.textContent = 'Pot — · Blinds — / —';

  const footer = document.createElement('footer');
  footer.className = 'unseated-footer';

  const heading = document.createElement('h1');
  heading.className = 'surface-title unseated-heading';
  heading.textContent = 'Pick a seat';

  if (context.sitFailed) {
    const failureStatus = document.createElement('p');
    failureStatus.className = 'unseated-sit-failure';
    failureStatus.setAttribute('role', 'status');
    failureStatus.setAttribute('aria-live', 'polite');
    failureStatus.textContent = "Couldn't take a seat.";
    footer.append(failureStatus);
  }

  const sitButton = document.createElement('button');
  sitButton.type = 'button';
  sitButton.className = 'action-button unseated-sit-button';
  sitButton.textContent = 'Sit at Table';
  sitButton.addEventListener('click', () => {
    context.onSit?.();
  });

  footer.append(heading, sitButton);
  shell.append(felt, boardArea, seatList, pot, footer);
  root.append(shell);
}
