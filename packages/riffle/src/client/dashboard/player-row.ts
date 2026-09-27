import { cardAccessibleName, createCardImage } from './assets.js';

export type PlayerRowPosition = 'D' | 'SB' | 'BB';

export interface PlayerRowSeat {
  seatId: string;
  displayName: string;
  isLocal: boolean;
  avatarUrl?: string;
  stack: number;
  inHand: boolean;
  allIn?: boolean;
  lastAction: string | null;
  committed: number;
  position: PlayerRowPosition | null;
  acting: boolean;
  turnRemainingMs: number | null;
  turnBudgetMs: number | null;
  wonAmount?: number;
  holeCards?: Array<{ rank: string; suit: 'h' | 'd' | 'c' | 's' }>;
  phase?: 'betting' | 'complete';
  /** Amount the local seat must call on its turn; shown on the local tile. */
  toCall?: number;
}

export type DashboardBreakpoint = 'desktop' | 'tablet' | 'phone';

const POSITION_LABELS: Record<PlayerRowPosition, string> = {
  D: 'Dealer',
  SB: 'Small blind',
  BB: 'Big blind',
};

export function formatPlayChips(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`;
}

export function formatTimerText(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function deriveInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '';
  }
  if (words.length === 1) {
    const word = words[0] ?? '';
    return word.length >= 2
      ? word.slice(0, 2).toUpperCase()
      : word.slice(0, 1).toUpperCase();
  }
  const first = words[0]?.[0] ?? '';
  const second = words[1]?.[0] ?? '';
  return `${first}${second}`.toUpperCase();
}

function getDashboardBreakpoint(region: HTMLElement): DashboardBreakpoint {
  const dashboardRoot = region.closest('[data-surface="dashboard"]');
  const breakpoint = dashboardRoot?.getAttribute('data-breakpoint');
  if (breakpoint === 'tablet' || breakpoint === 'phone') {
    return breakpoint;
  }
  return 'desktop';
}

function createTextField(
  field:
    | 'name'
    | 'stack'
    | 'last-action'
    | 'committed'
    | 'position'
    | 'timer'
    | 'initials'
    | 'fold'
    | 'all-in'
    | 'won',
  text: string,
): HTMLElement {
  const element = document.createElement('span');
  element.dataset.field = field;
  element.textContent = text;
  return element;
}

function createStackField(
  breakpoint: DashboardBreakpoint,
  stack: number,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.dataset.field = 'stack';

  if (breakpoint !== 'phone') {
    const label = document.createElement('span');
    label.className = 'player-row-stack-label';
    label.textContent = 'Stack';
    wrapper.append(label);
  }

  const amount = document.createElement('span');
  amount.className = 'player-row-stack-amount';
  amount.textContent = formatPlayChips(stack);
  wrapper.append(amount);
  return wrapper;
}

function createAvatarField(avatarUrl: string): HTMLElement {
  const avatar = document.createElement('img');
  avatar.dataset.field = 'avatar';
  avatar.className = 'player-row-avatar';
  avatar.src = avatarUrl;
  avatar.alt = '';
  avatar.decoding = 'async';
  return avatar;
}

function createInitialsField(displayName: string): HTMLElement {
  const circle = document.createElement('div');
  circle.className = 'player-row-initials';
  circle.append(createTextField('initials', deriveInitials(displayName)));
  return circle;
}

type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

function actionTone(text: string): BadgeTone {
  if (/fold/i.test(text)) {
    return 'danger';
  }
  if (/call/i.test(text)) {
    return 'warning';
  }
  if (/raise|bet|won/i.test(text)) {
    return 'success';
  }
  if (/all-in/i.test(text)) {
    return 'info';
  }
  return 'neutral';
}

function asBadge(element: HTMLElement, tone: BadgeTone): HTMLElement {
  element.classList.add('player-row-badge');
  element.dataset.tone = tone;
  return element;
}

/** Video-tile backdrops from the design; picked per seat so a player keeps one color. */
const VIDEO_TONES = ['violet', 'green', 'ember', 'navy'] as const;

function videoTone(seat: PlayerRowSeat): string {
  if (seat.isLocal) {
    return 'local';
  }
  if (!seat.avatarUrl) {
    return 'camera-off';
  }
  let hash = 0;
  for (const char of seat.seatId) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return VIDEO_TONES[hash % VIDEO_TONES.length] ?? 'violet';
}

function isHoleFaceCard(
  card: unknown,
): card is { rank: string; suit: 'h' | 'd' | 'c' | 's' } {
  return (
    typeof card === 'object' &&
    card !== null &&
    'rank' in card &&
    'suit' in card &&
    typeof (card as { rank: unknown }).rank === 'string' &&
    typeof (card as { suit: unknown }).suit === 'string'
  );
}

function createCardFaces(
  cards: Array<{ rank: string; suit: 'h' | 'd' | 'c' | 's' }>,
): HTMLElement {
  const cardsEl = document.createElement('div');
  cardsEl.dataset.field = 'cards';
  cardsEl.dataset.cards = 'faces';
  cardsEl.className = 'player-row-card-faces';

  cardsEl.setAttribute('role', 'img');
  cardsEl.setAttribute('aria-label', cards.map(cardAccessibleName).join(', '));
  for (const card of cards) {
    cardsEl.append(createCardImage(card, 'player-row-card-face'));
  }

  return cardsEl;
}

function createCardBacks(): HTMLElement {
  const cards = document.createElement('div');
  cards.dataset.field = 'cards';
  cards.dataset.cards = 'backs';
  cards.className = 'player-row-card-backs';

  for (let index = 0; index < 2; index += 1) {
    cards.append(createCardImage('back', 'player-row-card-back'));
  }

  return cards;
}

function createTimer(
  seat: PlayerRowSeat,
): { timerText: HTMLElement; timerBar: HTMLElement } | null {
  if (!seat.acting || seat.turnRemainingMs === null) {
    return null;
  }

  const timerText = createTextField('timer', formatTimerText(seat.turnRemainingMs));
  timerText.className = 'player-row-timer-text visually-hidden';

  const timerTrack = document.createElement('div');
  timerTrack.className = 'player-row-timer-track';

  const timerBar = document.createElement('div');
  timerBar.className = 'player-row-timer-bar';
  timerBar.dataset.field = 'timer-bar';
  timerTrack.append(timerBar);

  if (
    seat.turnBudgetMs !== null &&
    seat.turnBudgetMs > 0 &&
    seat.turnRemainingMs !== null
  ) {
    const fraction = Math.max(
      0,
      Math.min(1, seat.turnRemainingMs / seat.turnBudgetMs),
    );
    timerBar.style.width = `${(fraction * 100).toFixed(2)}%`;
  }

  return { timerText, timerBar: timerTrack };
}

function createSeatTile(
  seat: PlayerRowSeat,
  breakpoint: DashboardBreakpoint,
): HTMLElement {
  const tile = document.createElement('article');
  tile.className = 'player-row-tile';
  tile.dataset.seat = seat.seatId;

  if (seat.isLocal) {
    tile.dataset.local = 'true';
  }

  if (seat.acting) {
    tile.dataset.acting = 'true';
  }

  tile.dataset.state = seat.inHand ? (seat.allIn ? 'all-in' : 'in-hand') : 'folded';

  const video = document.createElement('div');
  video.className = 'player-row-video';
  video.dataset.tone = videoTone(seat);
  video.append(
    seat.avatarUrl ? createAvatarField(seat.avatarUrl) : createInitialsField(seat.displayName),
  );

  if (seat.position) {
    const position = createTextField('position', seat.position);
    position.className = 'player-row-position';
    position.dataset.position = seat.position;
    position.setAttribute('aria-label', POSITION_LABELS[seat.position]);
    video.append(position);
  }

  const name = createTextField('name', seat.isLocal ? 'You' : seat.displayName);
  name.className = 'player-row-name';

  const status = document.createElement('div');
  status.className = 'player-row-status';

  const badges: HTMLElement[] = [];
  const localTurn = seat.isLocal && seat.acting && seat.inHand;
  if (localTurn && breakpoint !== 'phone') {
    const turn = document.createElement('span');
    turn.textContent = 'Your turn';
    turn.setAttribute('aria-hidden', 'true');
    badges.push(asBadge(turn, 'info'));
  }
  if (seat.allIn && seat.inHand) {
    badges.push(asBadge(createTextField('all-in', 'All-in'), 'info'));
  }
  if (seat.wonAmount !== undefined && seat.wonAmount > 0) {
    const won = createTextField('won', `Won ${formatPlayChips(seat.wonAmount)}`);
    won.setAttribute('role', 'status');
    won.setAttribute('aria-live', 'polite');
    badges.push(asBadge(won, 'success'));
  }
  if (seat.lastAction && !localTurn) {
    badges.push(asBadge(createTextField('last-action', seat.lastAction), actionTone(seat.lastAction)));
  }

  if (breakpoint === 'phone') {
    video.dataset.compact = 'true';
    const firstName = seat.displayName.trim().split(/\s+/)[0] ?? '';
    if (!seat.isLocal && firstName && firstName !== seat.displayName) {
      name.textContent = firstName;
      name.title = seat.displayName;
    }
    status.append(name, createStackField(breakpoint, seat.stack), ...badges);
    tile.append(video, status);
    return tile;
  }

  video.append(name);

  const stackRow = document.createElement('div');
  stackRow.className = 'player-row-stack-row';
  stackRow.append(createStackField(breakpoint, seat.stack));

  if (!seat.isLocal) {
    if (
      seat.holeCards &&
      seat.holeCards.length === 2 &&
      isHoleFaceCard(seat.holeCards[0]) &&
      isHoleFaceCard(seat.holeCards[1])
    ) {
      stackRow.append(createCardFaces(seat.holeCards));
    } else if (seat.inHand) {
      stackRow.append(createCardBacks());
    } else {
      const fold = createTextField('fold', 'Fold');
      fold.className = 'visually-hidden';
      stackRow.append(fold);
    }
  }
  status.append(stackRow);

  const detail =
    localTurn && seat.toCall !== undefined && seat.toCall > 0
      ? `To call ${formatPlayChips(seat.toCall)}`
      : seat.committed > 0
        ? `${formatPlayChips(seat.committed)} in`
        : null;

  if (badges.length > 0 || detail) {
    const actionRow = document.createElement('div');
    actionRow.className = 'player-row-action-row';
    const badgeGroup = document.createElement('div');
    badgeGroup.className = 'player-row-badges';
    badgeGroup.append(...badges);
    actionRow.append(badgeGroup);
    if (detail) {
      const committed = createTextField('committed', detail);
      committed.className = 'player-row-committed';
      actionRow.append(committed);
    }
    status.append(actionRow);
  }

  const timer = createTimer(seat);
  if (timer) {
    status.append(timer.timerText, timer.timerBar);
  }

  tile.append(video, status);
  return tile;
}

export function renderPlayerRow(
  region: HTMLElement,
  seats: PlayerRowSeat[],
): void {
  region.replaceChildren();

  const breakpoint = getDashboardBreakpoint(region);
  const visibleSeats =
    breakpoint === 'phone' ? seats.filter((seat) => !seat.isLocal) : seats;

  const list = document.createElement('div');
  list.className = 'player-row-tiles';

  for (const seat of visibleSeats) {
    list.append(createSeatTile(seat, breakpoint));
  }

  region.append(list);

  const localActing = visibleSeats.some(
    (seat) => seat.isLocal && seat.acting && breakpoint !== 'phone',
  );
  if (localActing) {
    const announcement = document.createElement('div');
    announcement.className = 'player-row-turn-announcement';
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.textContent = 'Your turn';
    region.append(announcement);
  }
}
