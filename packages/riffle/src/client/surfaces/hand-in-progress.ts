import { renderHoleCardsArea, renderOpponentSeatLabels } from './hole-cards.js';
import { renderActionsBar, renderPotAndStacks } from '../actions-bar.js';
import { renderBoardArea } from '../board.js';
import type { BoardCard } from '../board.js';

export type HoleCard = `${string}`;

export interface HandInProgressContext {
  matchId: string;
  seatId: string;
  hole: [HoleCard, HoleCard];
  board?: BoardCard[];
  previousBoardLength?: number;
  opponents?: Array<{ seatId: string; label: string; stack: string }>;
  pot?: number;
  stacks?: Array<{ seatId: string; stack: number }>;
  facingBet?: boolean;
  showDisabledActionsBar?: boolean;
}

export function renderHandInProgress(
  root: HTMLElement,
  context: HandInProgressContext,
): void {
  root.replaceChildren();
  root.dataset.surface = 'hand-in-progress';
  root.dataset.matchId = context.matchId;
  root.dataset.seatId = context.seatId;

  const shell = document.createElement('section');
  shell.className = 'surface surface-hand-in-progress';
  shell.setAttribute('role', 'region');
  shell.setAttribute('aria-label', 'Poker table hand in progress');

  const felt = document.createElement('div');
  felt.className = 'table-felt';
  felt.setAttribute('aria-hidden', 'true');

  renderBoardArea(felt, {
    board: context.board,
    previousBoardLength: context.previousBoardLength,
  });

  const playerSeat = document.createElement('div');
  playerSeat.className = 'player-seat player-seat-you';

  const seatLabel = document.createElement('span');
  seatLabel.className = 'player-seat-label';
  seatLabel.textContent = 'YOU';

  playerSeat.append(seatLabel);
  renderHoleCardsArea(playerSeat, context.hole, { variant: 'dealt', announceDeal: true });

  if (context.opponents?.length) {
    renderOpponentSeatLabels(felt, context.opponents);
  }

  const header = document.createElement('header');
  header.className = 'table-header';

  const title = document.createElement('h1');
  title.className = 'surface-title';
  title.textContent = 'Hand in progress';

  const match = document.createElement('p');
  match.className = 'table-match-id';
  match.textContent = `Match ${context.matchId}`;

  header.append(title, match);
  shell.append(felt, playerSeat, header);

  if (context.pot !== undefined && context.stacks) {
    const publicFacts = document.createElement('div');
    publicFacts.className = 'table-public-facts';
    renderPotAndStacks(publicFacts, context.pot, context.stacks);
    shell.append(publicFacts);
  }

  if (context.showDisabledActionsBar) {
    const actionsHost = document.createElement('div');
    actionsHost.className = 'betting-controls';
    renderActionsBar(actionsHost, {
      enabled: false,
      facingBet: context.facingBet ?? false,
      legalActions: [],
      onSubmit: () => undefined,
    });
    shell.append(actionsHost);
  }

  root.append(shell);
}
