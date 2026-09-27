import { cardAccessibleName, cardAssetUrl, createCardImage, createChip } from './assets.js';
import { formatPlayChips } from './player-row.js';

export interface BoardCard {
  rank: string;
  suit: 'h' | 'd' | 'c' | 's';
}

export interface BoardAndPotViewModel {
  boardCards?: BoardCard[];
  /** Ignored — fixtures may include hole cards to prove they never render here. */
  holeCards?: BoardCard[];
  pot?: number;
  pots?: Array<{ label: string; amount: number }>;
  playersInHand?: number;
  actionOnYou?: boolean;
  phase?: 'betting' | 'complete' | 'street_complete' | 'fold_to_one' | 'showdown_ready';
}

type DashboardBreakpoint = 'desktop' | 'tablet' | 'phone';

const SUIT_SYMBOLS: Record<BoardCard['suit'], string> = {
  h: '♥',
  d: '♦',
  c: '♣',
  s: '♠',
};

const EMPTY_STREET_LABELS = {
  flop: 'Empty Flop',
  turn: 'Empty Turn',
  river: 'Empty River',
} as const;

function getDashboardBreakpoint(region: HTMLElement): DashboardBreakpoint {
  const dashboardRoot = region.closest('[data-surface="dashboard"]');
  const breakpoint = dashboardRoot?.getAttribute('data-breakpoint');
  if (breakpoint === 'tablet' || breakpoint === 'phone') {
    return breakpoint;
  }
  return 'desktop';
}

function formatVisibleCard(card: BoardCard): string {
  return `${card.rank.toUpperCase()}${SUIT_SYMBOLS[card.suit]}`;
}

function createTextFace(card: BoardCard): HTMLElement {
  const face = document.createElement('span');
  face.className = 'board-card-face';
  face.textContent = formatVisibleCard(card);
  face.setAttribute('aria-hidden', 'true');
  return face;
}

function formatPlayersInHand(count: number): string {
  if (count === 1) {
    return '1 player in the hand';
  }
  return `${count} players in the hand`;
}

function createCardSlot(
  card: BoardCard | undefined,
  emptyLabel: string,
  field: string,
): HTMLElement {
  const slot = document.createElement('div');
  slot.className = 'board-card-slot';
  slot.dataset.field = field;

  if (card) {
    slot.dataset.filled = 'true';
    slot.setAttribute('role', 'img');
    slot.setAttribute('aria-label', cardAccessibleName(card));
    const face = cardAssetUrl(card) ? createCardImage(card, 'board-card-face') : createTextFace(card);
    face.dataset.field = `${field}-face`;
    slot.append(face);
    return slot;
  }

  slot.setAttribute('role', 'img');
  slot.setAttribute('aria-label', emptyLabel);
  const placeholder = document.createElement('span');
  placeholder.className = 'board-card-placeholder';
  placeholder.dataset.field = `${field}-placeholder`;
  placeholder.textContent = '?';
  placeholder.setAttribute('aria-hidden', 'true');
  slot.append(placeholder);
  return slot;
}

function createStreetGroup(
  street: 'flop' | 'turn' | 'river',
  label: string,
  cards: (BoardCard | undefined)[],
): HTMLElement {
  const group = document.createElement('div');
  group.className = 'board-street';
  group.dataset.field = street;

  const labelEl = document.createElement('span');
  labelEl.className = 'board-street-label';
  labelEl.dataset.field = `${street}-label`;
  labelEl.textContent = label;

  const slots = document.createElement('div');
  slots.className = 'board-street-slots';
  slots.dataset.field = `${street}-slots`;

  cards.forEach((card, index) => {
    slots.append(
      createCardSlot(card, EMPTY_STREET_LABELS[street], `${street}-slot-${index + 1}`),
    );
  });

  group.append(slots, labelEl);
  return group;
}

function createPotLabel(text: string): HTMLElement {
  const potLabel = document.createElement('span');
  potLabel.className = 'board-pot-label';
  potLabel.dataset.field = 'pot-label';
  potLabel.textContent = text;
  return potLabel;
}

function createPotAmount(amount: number): HTMLElement {
  const potAmount = document.createElement('span');
  potAmount.className = 'board-pot-amount';
  potAmount.dataset.field = 'pot-amount';
  potAmount.textContent = formatPlayChips(amount);
  return potAmount;
}

function createPotRows(pots: Array<{ label: string; amount: number }>): HTMLElement[] {
  return pots.map((pot) => {
    const row = document.createElement('div');
    row.className = 'board-pot-row';
    row.dataset.field = 'pot-row';
    row.append(createPotLabel(pot.label), createPotAmount(pot.amount));
    return row;
  });
}

function createPotSection(
  viewModel: BoardAndPotViewModel,
  includeMeta: boolean,
): HTMLElement {
  const potSection = document.createElement('div');
  potSection.className = 'board-pot';
  potSection.dataset.field = 'pot-section';

  const heading = document.createElement('div');
  heading.className = 'board-pot-heading';
  heading.append(createChip());
  potSection.append(heading);

  if (viewModel.pots && viewModel.pots.length > 1) {
    potSection.dataset.pots = 'split';
    potSection.append(...createPotRows(viewModel.pots));
  } else {
    heading.append(createPotLabel('Pot'));
    if (viewModel.pot !== undefined) {
      potSection.append(createPotAmount(viewModel.pot));
    }
  }

  if (includeMeta) {
    if (viewModel.playersInHand !== undefined) {
      const playersInHand = document.createElement('span');
      playersInHand.className = 'board-players-in-hand';
      playersInHand.dataset.field = 'players-in-hand';
      playersInHand.textContent = formatPlayersInHand(viewModel.playersInHand);
      potSection.append(playersInHand);
    }

    if (viewModel.actionOnYou === true) {
      const actionOnYou = document.createElement('span');
      actionOnYou.className = 'board-action-on-you';
      actionOnYou.dataset.field = 'action-on-you';
      actionOnYou.textContent = 'Action on you';
      potSection.append(actionOnYou);
    }
  }

  return potSection;
}

function splitBoardCards(boardCards: BoardCard[]): {
  flop: (BoardCard | undefined)[];
  turn: (BoardCard | undefined)[];
  river: (BoardCard | undefined)[];
  phone: (BoardCard | undefined)[];
} {
  const cards = boardCards.slice(0, 5);
  return {
    flop: [cards[0], cards[1], cards[2]],
    turn: [cards[3]],
    river: [cards[4]],
    phone: [cards[0], cards[1], cards[2], cards[3], cards[4]],
  };
}

function renderDesktopOrTablet(
  panel: HTMLElement,
  viewModel: BoardAndPotViewModel,
): void {
  const { flop, turn, river } = splitBoardCards(viewModel.boardCards ?? []);

  const streets = document.createElement('div');
  streets.className = 'board-streets';
  streets.dataset.field = 'streets';
  streets.append(
    createStreetGroup('flop', 'Flop', flop),
    createStreetGroup('turn', 'Turn', turn),
    createStreetGroup('river', 'River', river),
  );

  panel.append(streets, createPotSection(viewModel, true));
}

function renderPhone(panel: HTMLElement, viewModel: BoardAndPotViewModel): void {
  panel.classList.add('board-and-pot-panel-phone');

  const header = document.createElement('div');
  header.className = 'board-phone-header';
  header.dataset.field = 'phone-header';

  const title = document.createElement('span');
  title.className = 'board-phone-title';
  title.dataset.field = 'board-header';
  title.textContent = 'Board';
  header.append(title);

  const potRow = document.createElement('div');
  potRow.className = 'board-phone-pot';
  potRow.dataset.field = 'phone-pot';
  potRow.append(createChip());

  if (viewModel.pots && viewModel.pots.length > 1) {
    potRow.append(...createPotRows(viewModel.pots));
  } else {
    potRow.append(createPotLabel('Pot'));
    if (viewModel.pot !== undefined) {
      potRow.append(createPotAmount(viewModel.pot));
    }
  }

  header.append(potRow);
  panel.append(header);

  const slots = document.createElement('div');
  slots.className = 'board-phone-slots';
  slots.dataset.field = 'phone-slots';

  const { phone } = splitBoardCards(viewModel.boardCards ?? []);
  phone.forEach((card, index) => {
    slots.append(createCardSlot(card, 'Empty board card', `phone-slot-${index + 1}`));
  });

  panel.append(slots);
}

export function renderBoardAndPot(
  region: HTMLElement,
  viewModel: BoardAndPotViewModel,
): void {
  region.replaceChildren();

  const breakpoint = getDashboardBreakpoint(region);
  const panel = document.createElement('div');
  panel.className = 'board-and-pot-panel';

  if (breakpoint === 'phone') {
    renderPhone(panel, viewModel);
  } else {
    renderDesktopOrTablet(panel, viewModel);
  }

  region.append(panel);
}
