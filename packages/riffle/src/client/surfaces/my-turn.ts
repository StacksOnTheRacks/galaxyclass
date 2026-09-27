import { renderHoleCardsArea, renderOpponentSeatLabels } from './hole-cards.js';
import {
  renderActionsBar,
  renderPotAndStacks,
  type LegalActionOption,
} from '../actions-bar.js';
import { renderBoardArea } from '../board.js';
import type { BoardCard } from '../board.js';

export type HoleCard = `${string}`;

export interface MyTurnContext {
  matchId: string;
  seatId: string;
  hole: [HoleCard, HoleCard];
  board?: BoardCard[];
  previousBoardLength?: number;
  opponents?: Array<{ seatId: string; label: string; stack: string }>;
  pot?: number;
  stacks?: Array<{ seatId: string; stack: number }>;
  legalActions?: LegalActionOption[];
  facingBet?: boolean;
  onSubmitAction?: (action: { type: string; amount?: number }) => void | Promise<void>;
}

export function renderMyTurn(root: HTMLElement, context: MyTurnContext): void {
  root.replaceChildren();
  root.dataset.surface = 'my-turn';
  root.dataset.matchId = context.matchId;
  root.dataset.seatId = context.seatId;

  const shell = document.createElement('section');
  shell.className = 'surface surface-my-turn';
  shell.setAttribute('role', 'region');
  shell.setAttribute('aria-label', 'Poker table your turn');

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
  renderHoleCardsArea(playerSeat, context.hole, { variant: 'dealt' });

  if (context.opponents?.length) {
    renderOpponentSeatLabels(felt, context.opponents);
  }

  const header = document.createElement('header');
  header.className = 'table-header';

  const title = document.createElement('h1');
  title.className = 'surface-title';
  title.textContent = 'Your turn';

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

  if (context.legalActions && context.onSubmitAction) {
    const actionsHost = document.createElement('div');
    actionsHost.className = 'betting-controls';
    renderActionsBar(actionsHost, {
      enabled: true,
      facingBet: context.facingBet ?? false,
      legalActions: context.legalActions,
      onSubmit: context.onSubmitAction,
    });
    shell.append(actionsHost);
  }

  root.append(shell);
}
