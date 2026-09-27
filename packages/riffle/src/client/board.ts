export type BoardCard = `${string}`;

export interface BoardContext {
  board?: BoardCard[];
  previousBoardLength?: number;
}

function streetLabel(boardLength: number): string | null {
  if (boardLength === 3) {
    return 'FLOP';
  }
  if (boardLength === 4) {
    return 'TURN';
  }
  if (boardLength === 5) {
    return 'RIVER';
  }
  return null;
}

export function renderBoardArea(
  host: HTMLElement,
  context: BoardContext,
): void {
  const board = context.board ?? [];
  const label = streetLabel(board.length);

  const existing = host.querySelector('.board-area');
  if (existing) {
    existing.remove();
  }

  const area = document.createElement('div');
  area.className = 'board-area';
  area.setAttribute('role', 'group');
  area.setAttribute('aria-label', label ? `Community board ${label}` : 'Community board');

  if (label) {
    const street = document.createElement('p');
    street.className = 'board-street-label';
    street.textContent = label;
    area.append(street);
  }

  const slots = document.createElement('div');
  slots.className = 'board-slots';

  const maxSlots = 5;
  for (let i = 0; i < maxSlots; i += 1) {
    const slot = document.createElement('div');
    slot.className = 'board-slot';
    if (board[i]) {
      const card = document.createElement('span');
      card.className = 'board-card card-face';
      card.dataset.tag = 'BOARD';
      card.setAttribute('aria-label', `Board card ${board[i]}`);
      card.textContent = board[i]!;
      slot.append(card);
    } else {
      slot.classList.add('board-slot-empty');
      slot.setAttribute('aria-hidden', 'true');
    }
    slots.append(slot);
  }

  area.append(slots);
  host.prepend(area);

  const prevLength = context.previousBoardLength ?? 0;
  if (board.length > prevLength && board.length >= 3) {
    const live = host.querySelector('.street-live-region') ?? document.createElement('div');
    live.className = 'street-live-region';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
    const announced = label ? `Street ${label}` : 'Board updated';
    live.textContent = announced;
    if (!live.parentElement) {
      host.append(live);
    }
  }
}

export function boardLengthFromContext(context: BoardContext): number {
  return context.board?.length ?? 0;
}
