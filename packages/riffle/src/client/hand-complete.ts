import { renderHoleCardsArea } from './surfaces/hole-cards.js';
import { renderBoardArea } from './board.js';
import type { BoardCard } from './board.js';
import { renderTableShell } from './surfaces/table-shell.js';

export type HoleCard = `${string}`;

export type ShownHoleFact = {
  seatId: string;
  hole: [HoleCard, HoleCard];
};

export type HandCompleteWinner = {
  seatId: string;
  amount: number;
};

export interface ShowdownContext {
  matchId: string;
  seatId: string;
  hole: [HoleCard, HoleCard];
  board?: BoardCard[];
  pot?: number;
  winners?: HandCompleteWinner[];
  shownHoles?: ShownHoleFact[];
  onContinue?: () => void;
}

export interface HandCompleteContext {
  matchId: string;
  seatId: string;
  hole?: [HoleCard, HoleCard] | null;
  board?: BoardCard[];
  winners?: HandCompleteWinner[];
  shownHoles?: ShownHoleFact[];
  completeReason?: 'fold_to_one' | 'showdown';
  onNextHand?: () => void;
  onLeaveTable?: () => void;
}

function winnerLabel(winners: HandCompleteWinner[] | undefined): string {
  if (!winners || winners.length === 0) {
    return 'winner pending';
  }
  if (winners.length === 1) {
    return `${winners[0]!.seatId} wins`;
  }
  return `${winners.map((winner) => winner.seatId).join(', ')} split`;
}

function awardLine(winners: HandCompleteWinner[] | undefined): string {
  if (!winners || winners.length === 0) {
    return 'Awarded pot pending · Seat unknown';
  }
  const total = winners.reduce((sum, winner) => sum + winner.amount, 0);
  if (winners.length === 1) {
    return `Awarded pot ${total.toLocaleString()} · Seat ${winners[0]!.seatId}`;
  }
  return `Awarded pot ${total.toLocaleString()} · Seats ${winners.map((winner) => winner.seatId).join(', ')}`;
}

function renderShownOpponentHoles(
  container: HTMLElement,
  shownHoles: ShownHoleFact[] | undefined,
  ownSeatId: string,
): void {
  if (!shownHoles?.length) {
    return;
  }

  const group = document.createElement('div');
  group.className = 'shown-holes-area';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Shown opponent hole cards');

  for (const shown of shownHoles) {
    if (shown.seatId === ownSeatId) {
      continue;
    }

    const seatBlock = document.createElement('div');
    seatBlock.className = 'shown-hole-seat';

    const label = document.createElement('span');
    label.className = 'shown-hole-label';
    label.textContent = `SHOWN · ${shown.seatId}`;

    const cards = document.createElement('div');
    cards.className = 'shown-hole-cards';
    for (const card of shown.hole) {
      const cardEl = document.createElement('span');
      cardEl.className = 'hole-card shown-hole-card';
      cardEl.dataset.tag = 'SHOWN';
      cardEl.textContent = card;
      cardEl.setAttribute('aria-label', `Shown hole card ${card} seat ${shown.seatId}`);
      cards.append(cardEl);
    }

    seatBlock.append(label, cards);
    group.append(seatBlock);
  }

  if (group.childElementCount > 0) {
    container.append(group);
  }
}

export function renderShowdown(root: HTMLElement, context: ShowdownContext): void {
  root.replaceChildren();
  root.dataset.surface = 'showdown';
  root.dataset.matchId = context.matchId;
  root.dataset.seatId = context.seatId;

  const shell = document.createElement('section');
  shell.className = 'surface surface-showdown';
  shell.setAttribute('role', 'region');
  shell.setAttribute('aria-label', 'Poker table showdown');

  const liveRegion = document.createElement('div');
  liveRegion.className = 'complete-live-region';
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.textContent = `Showdown · ${winnerLabel(context.winners)}`;

  const felt = document.createElement('div');
  felt.className = 'table-felt';
  felt.setAttribute('aria-hidden', 'true');

  renderBoardArea(felt, { board: context.board });

  const playerSeat = document.createElement('div');
  playerSeat.className = 'player-seat player-seat-you';

  const seatLabel = document.createElement('span');
  seatLabel.className = 'player-seat-label';
  seatLabel.textContent = 'YOU';

  playerSeat.append(seatLabel);
  renderHoleCardsArea(playerSeat, context.hole, { variant: 'dealt' });

  renderShownOpponentHoles(felt, context.shownHoles, context.seatId);

  const header = document.createElement('header');
  header.className = 'table-header';

  const streetLabel = document.createElement('p');
  streetLabel.className = 'street-label';
  streetLabel.textContent = 'Street: Showdown';

  const status = document.createElement('p');
  status.className = 'turn-status';
  status.textContent = `Showdown · ${winnerLabel(context.winners)} (text, not color)`;

  const potLine = document.createElement('p');
  potLine.className = 'table-pot';
  potLine.textContent =
    context.pot !== undefined ? `Pot ${context.pot.toLocaleString()} · Blinds 1/2 (placeholder)` : 'Pot · Blinds 1/2 (placeholder)';

  header.append(streetLabel, status, potLine);
  shell.append(liveRegion, felt, playerSeat, header);

  const actionsHost = document.createElement('div');
  actionsHost.className = 'hand-complete-actions';

  const continueButton = document.createElement('button');
  continueButton.type = 'button';
  continueButton.className = 'action-button action-continue';
  continueButton.textContent = 'Continue';
  continueButton.addEventListener('click', () => {
    context.onContinue?.();
  });
  actionsHost.append(continueButton);
  shell.append(actionsHost);

  root.append(shell);
}

export function renderHandComplete(root: HTMLElement, context: HandCompleteContext): void {
  root.replaceChildren();
  root.dataset.surface = 'hand-complete';
  root.dataset.matchId = context.matchId;
  root.dataset.seatId = context.seatId;

  const shell = document.createElement('section');
  shell.className = 'surface surface-hand-complete';
  shell.setAttribute('role', 'region');
  shell.setAttribute('aria-label', 'Poker table hand complete');

  const liveRegion = document.createElement('div');
  liveRegion.className = 'complete-live-region';
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.textContent = 'Hand over · returning to between-hands';

  const felt = document.createElement('div');
  felt.className = 'table-felt';
  felt.setAttribute('aria-hidden', 'true');

  renderBoardArea(felt, { board: context.board });

  if (context.hole) {
    const playerSeat = document.createElement('div');
    playerSeat.className = 'player-seat player-seat-you';

    const seatLabel = document.createElement('span');
    seatLabel.className = 'player-seat-label';
    seatLabel.textContent = 'YOU';

    playerSeat.append(seatLabel);
    renderHoleCardsArea(playerSeat, context.hole, { variant: 'dealt' });
    shell.append(playerSeat);
  }

  renderShownOpponentHoles(felt, context.shownHoles, context.seatId);

  const award = document.createElement('p');
  award.className = 'hand-complete-award';
  award.textContent = awardLine(context.winners);

  const header = document.createElement('header');
  header.className = 'table-header';

  const streetLabel = document.createElement('p');
  streetLabel.className = 'street-label';
  streetLabel.textContent = 'Street: Hand complete';

  const status = document.createElement('p');
  status.className = 'turn-status';
  status.textContent = 'Hand over · returning to between-hands (not a lobby)';

  header.append(streetLabel, status);
  felt.append(award);
  shell.append(liveRegion, felt, header);

  const actionsHost = document.createElement('div');
  actionsHost.className = 'hand-complete-actions';

  const nextHandButton = document.createElement('button');
  nextHandButton.type = 'button';
  nextHandButton.className = 'action-button action-next-hand';
  nextHandButton.textContent = 'Next hand';
  nextHandButton.addEventListener('click', () => {
    context.onNextHand?.();
  });

  const leaveButton = document.createElement('button');
  leaveButton.type = 'button';
  leaveButton.className = 'action-button action-leave-table';
  leaveButton.textContent = 'Leave table';
  leaveButton.dataset.confirmAffordance = 'Confirm table-exit before it fires';
  leaveButton.addEventListener('click', () => {
    const confirmed = window.confirm('Confirm table-exit before it fires');
    if (!confirmed) {
      leaveButton.focus();
      return;
    }
    context.onLeaveTable?.();
  });

  actionsHost.append(nextHandButton, leaveButton);
  shell.append(actionsHost);

  root.append(shell);
}

export function renderWaitingForDeal(root: HTMLElement, matchId: string): void {
  renderTableShell(root, { matchId });
}

export function shouldRenderShowdown(
  completeReason: 'fold_to_one' | 'showdown' | undefined,
  uiPhase: 'showdown' | 'hand-complete',
): boolean {
  return completeReason === 'showdown' && uiPhase === 'showdown';
}
