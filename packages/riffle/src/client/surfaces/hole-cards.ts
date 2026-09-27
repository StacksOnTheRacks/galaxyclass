export type HoleCard = `${string}`;

export interface HoleCardSlot {
  card: HoleCard | '—';
}

export function renderHoleCardsArea(
  root: HTMLElement,
  cards: [HoleCard, HoleCard] | null,
  options: { variant?: 'empty' | 'dealt'; announceDeal?: boolean } = {},
): void {
  const variant = options.variant ?? (cards ? 'dealt' : 'empty');
  const holeArea = document.createElement('div');
  holeArea.className = 'hole-area';
  holeArea.setAttribute('role', 'group');

  if (variant === 'dealt' && cards) {
    holeArea.setAttribute('aria-label', 'Your hole cards (seat-private)');
  } else {
    holeArea.setAttribute('aria-label', 'Your hole cards, seat-private, empty');
  }

  const label = document.createElement('p');
  label.className = 'hole-area-label';
  label.textContent = 'Your hole cards (seat-private)';

  const holeCards = document.createElement('div');
  holeCards.className =
    variant === 'dealt' ? 'hole-cards hole-cards-dealt' : 'hole-cards hole-cards-empty';
  holeCards.removeAttribute('aria-hidden');

  if (variant === 'dealt' && cards) {
    for (const card of cards) {
      const slot = document.createElement('div');
      slot.className = 'hole-card';
      slot.setAttribute('data-tag', 'YOU');
      slot.setAttribute('aria-label', `Your hole card ${card}`);

      const tag = document.createElement('span');
      tag.className = 'hole-card-tag';
      tag.textContent = 'YOU';

      const rankSuit = document.createElement('span');
      rankSuit.className = 'hole-card-rank-suit';
      rankSuit.textContent = card;

      slot.append(tag, rankSuit);
      holeCards.append(slot);
    }
  }

  holeArea.append(label, holeCards);
  root.append(holeArea);

  if (options.announceDeal && variant === 'dealt') {
    const status = document.createElement('p');
    status.className = 'deal-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = 'Hand started. Hole cards dealt.';
    root.append(status);
  }
}

export function renderOpponentSeatLabels(
  root: HTMLElement,
  seats: Array<{ seatId: string; label: string; stack: string }>,
): void {
  const opponents = document.createElement('div');
  opponents.className = 'opponent-seats';
  opponents.setAttribute('aria-label', 'Other seats');

  for (const seat of seats) {
    const seatEl = document.createElement('div');
    seatEl.className = 'opponent-seat';
    seatEl.setAttribute('data-seat-id', seat.seatId);

    const label = document.createElement('span');
    label.className = 'opponent-seat-label';
    label.textContent = seat.label;

    const stack = document.createElement('span');
    stack.className = 'opponent-seat-stack';
    stack.textContent = seat.stack;

    seatEl.append(label, stack);
    opponents.append(seatEl);
  }

  root.append(opponents);
}
