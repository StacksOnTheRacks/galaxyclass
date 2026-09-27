import { cardAssetUrl, createCardImage } from './assets.js';
import { formatPlayChips } from './player-row.js';

export interface PocketCard {
  rank: string;
  suit: 'h' | 'd' | 'c' | 's';
}

export interface MyHandActionLogEntry {
  displayName: string;
  actionText: string;
}

export interface MyHandPanelViewModel {
  pocketCards?: PocketCard[];
  /** Ignored — fixtures may include foreign holes to prove they never render here. */
  foreignPocketCards?: PocketCard[];
  bank: number;
  sessionDelta?: number;
  committedThisHand?: number;
  madeHand?: string;
  tier?: string;
  meterFilled?: number;
  outsCount?: number;
  outsPhrase?: string;
  street?: string;
  actionLog?: MyHandActionLogEntry[];
}

type DashboardBreakpoint = 'desktop' | 'tablet' | 'phone';

const RANK_NAMES: Record<string, string> = {
  A: 'Ace',
  K: 'King',
  Q: 'Queen',
  J: 'Jack',
  T: 'Ten',
  '9': 'Nine',
  '8': 'Eight',
  '7': 'Seven',
  '6': 'Six',
  '5': 'Five',
  '4': 'Four',
  '3': 'Three',
  '2': 'Two',
};

const SUIT_NAMES: Record<PocketCard['suit'], string> = {
  h: 'Hearts',
  d: 'Diamonds',
  c: 'Clubs',
  s: 'Spades',
};

const SUIT_SYMBOLS: Record<PocketCard['suit'], string> = {
  h: '♥',
  d: '♦',
  c: '♣',
  s: '♠',
};

const METER_LABELS = [
  'High card',
  'One pair',
  'Two pair',
  'Three of a kind',
  'Straight',
  'Flush',
  'Full house',
  'Four of a kind',
  'Straight flush',
  'Royal flush',
];

function getDashboardBreakpoint(region: HTMLElement): DashboardBreakpoint {
  const dashboardRoot = region.closest('[data-surface="dashboard"]');
  const breakpoint = dashboardRoot?.getAttribute('data-breakpoint');
  if (breakpoint === 'tablet' || breakpoint === 'phone') {
    return breakpoint;
  }
  return 'desktop';
}

function formatAccessibleCardName(card: PocketCard): string {
  const rankName = RANK_NAMES[card.rank.toUpperCase()] ?? card.rank;
  const suitName = SUIT_NAMES[card.suit];
  return `${rankName} of ${suitName}`;
}

function formatVisibleCard(card: PocketCard): string {
  return `${card.rank.toUpperCase()}${SUIT_SYMBOLS[card.suit]}`;
}

function formatSignedSessionDelta(amount: number): string {
  const formatted = formatPlayChips(Math.abs(amount));
  if (amount > 0) {
    return `+${formatted}`;
  }
  if (amount < 0) {
    return `-${formatted}`;
  }
  return formatted;
}

function createTextElement(
  className: string,
  field: string,
  text: string,
): HTMLElement {
  const element = document.createElement('span');
  element.className = className;
  element.dataset.field = field;
  element.textContent = text;
  return element;
}

function createPocketFaces(cards: PocketCard[]): HTMLElement {
  const group = document.createElement('div');
  group.className = 'my-hand-pocket';
  group.dataset.field = 'pocket';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Your pocket cards');

  for (const card of cards) {
    const face = document.createElement('div');
    face.className = 'my-hand-pocket-card';
    face.setAttribute('role', 'img');
    face.setAttribute('aria-label', formatAccessibleCardName(card));

    if (cardAssetUrl(card)) {
      face.append(createCardImage(card, 'my-hand-pocket-card-image'));
    } else {
      const visible = document.createElement('span');
      visible.className = 'my-hand-pocket-card-rank-suit';
      visible.textContent = formatVisibleCard(card);
      visible.setAttribute('aria-hidden', 'true');
      face.append(visible);
    }
    group.append(face);
  }

  return group;
}

function toneFor(text: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (/fold|weak/i.test(text)) {
    return 'danger';
  }
  if (/call|medium|fair|draw/i.test(text)) {
    return 'warning';
  }
  if (/raise|bet|strong|monster|nuts|won/i.test(text)) {
    return 'success';
  }
  return 'neutral';
}

function createDivider(): HTMLElement {
  const divider = document.createElement('hr');
  divider.className = 'my-hand-divider';
  return divider;
}

function createBankField(bank: number): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'my-hand-bank';
  wrapper.dataset.field = 'bank';

  wrapper.append(createTextElement('my-hand-bank-label', 'bank-label', 'Your bank'));
  wrapper.append(
    createTextElement('my-hand-bank-amount', 'bank-amount', formatPlayChips(bank)),
  );
  return wrapper;
}

function createSessionField(sessionDelta: number): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'my-hand-session';
  wrapper.dataset.field = 'session';

  wrapper.append(
    createTextElement(
      'my-hand-session-amount',
      'session-amount',
      formatSignedSessionDelta(sessionDelta),
    ),
  );
  wrapper.append(
    createTextElement('my-hand-session-label', 'session-label', 'this session'),
  );
  return wrapper;
}

function createCommittedField(committedThisHand: number): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'my-hand-committed';
  wrapper.dataset.field = 'committed';

  wrapper.append(
    createTextElement(
      'my-hand-committed-amount',
      'committed-amount',
      formatPlayChips(committedThisHand),
    ),
  );
  wrapper.append(
    createTextElement(
      'my-hand-committed-label',
      'committed-label',
      'committed this hand',
    ),
  );
  return wrapper;
}

function createStrengthSection(
  viewModel: MyHandPanelViewModel,
  breakpoint: DashboardBreakpoint,
): HTMLElement | null {
  if (!viewModel.madeHand && !viewModel.tier) {
    return null;
  }

  const section = document.createElement('div');
  section.className = 'my-hand-strength';
  section.dataset.field = 'strength';

  const tier = viewModel.tier
    ? createTextElement('my-hand-tier', 'tier', viewModel.tier)
    : null;
  if (tier && viewModel.tier) {
    tier.dataset.tone = toneFor(viewModel.tier);
  }

  const madeHand = viewModel.madeHand
    ? createTextElement('my-hand-made-hand', 'made-hand', viewModel.madeHand)
    : null;

  if (breakpoint === 'phone') {
    if (madeHand) {
      section.append(madeHand);
    }
  } else {
    const header = document.createElement('div');
    header.className = 'my-hand-strength-header';
    const heading = document.createElement('div');
    heading.className = 'my-hand-strength-heading';
    heading.append(
      createTextElement('my-hand-strength-label', 'strength-label', 'Hand strength'),
    );
    if (madeHand) {
      heading.append(madeHand);
    }
    header.append(heading);
    if (tier) {
      header.append(tier);
    }
    section.append(header);
  }

  if (viewModel.meterFilled !== undefined) {
    const meter = document.createElement('div');
    meter.className = 'my-hand-meter';
    meter.dataset.field = 'meter';
    meter.setAttribute('role', 'img');
    meter.setAttribute(
      'aria-label',
      `Hand strength meter: ${METER_LABELS[Math.max(0, Math.min(METER_LABELS.length - 1, viewModel.meterFilled))]}`,
    );

    const filled = Math.max(0, Math.min(METER_LABELS.length, viewModel.meterFilled));
    for (let index = 0; index < METER_LABELS.length; index += 1) {
      const segment = document.createElement('span');
      segment.className = 'my-hand-meter-segment';
      segment.dataset.segment = String(index + 1);
      segment.setAttribute('aria-hidden', 'true');
      if (index < filled) {
        segment.dataset.filled = 'true';
      }
      meter.append(segment);
    }

    section.append(meter);

    if (breakpoint !== 'phone') {
      const scale = document.createElement('div');
      scale.className = 'my-hand-meter-scale';
      scale.setAttribute('aria-hidden', 'true');
      scale.append(
        createTextElement('my-hand-meter-scale-label', 'meter-scale-low', METER_LABELS[0] ?? ''),
        createTextElement(
          'my-hand-meter-scale-label',
          'meter-scale-high',
          METER_LABELS[METER_LABELS.length - 1] ?? '',
        ),
      );
      section.append(scale);
    }
  }

  if (breakpoint === 'phone') {
    if (tier || viewModel.outsPhrase) {
      const meta = document.createElement('div');
      meta.className = 'my-hand-strength-meta';
      if (tier) {
        meta.append(tier);
      }
      if (viewModel.outsPhrase) {
        meta.append(createOutsField(viewModel.outsPhrase));
      }
      section.append(meta);
    }
  } else if (viewModel.outsPhrase) {
    section.append(createOutsField(viewModel.outsPhrase, viewModel.outsCount));
  }

  return section;
}

function createOutsField(outsPhrase: string, outsCount?: number): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'my-hand-outs';
  wrapper.dataset.field = 'outs';
  wrapper.append(createTextElement('my-hand-outs-phrase', 'outs-phrase', outsPhrase));
  if (outsCount !== undefined) {
    wrapper.append(
      createTextElement(
        'my-hand-outs-count',
        'outs-count',
        `${outsCount} ${outsCount === 1 ? 'out' : 'outs'}`,
      ),
    );
  }
  return wrapper;
}

function createActionLog(
  street: string,
  entries: MyHandActionLogEntry[],
): HTMLElement {
  const log = document.createElement('div');
  log.className = 'my-hand-action-log';
  log.dataset.field = 'action-log';

  const heading = document.createElement('h3');
  heading.className = 'my-hand-action-log-heading';
  heading.dataset.field = 'action-log-heading';
  heading.textContent = `${street} action`;
  log.append(heading);

  if (entries.length === 0) {
    return log;
  }

  const list = document.createElement('ul');
  list.className = 'my-hand-action-log-list';

  for (const entry of entries) {
    const row = document.createElement('li');
    row.className = 'my-hand-action-log-row';
    row.dataset.field = 'action-log-row';

    const name = document.createElement('span');
    name.className = 'my-hand-action-log-name';
    name.dataset.field = 'action-log-name';
    name.textContent = entry.displayName;

    const action = document.createElement('span');
    action.className = 'my-hand-action-log-action';
    action.dataset.field = 'action-log-action';
    action.dataset.tone = toneFor(entry.actionText);
    action.textContent = entry.actionText;

    row.append(name, action);
    list.append(row);
  }

  log.append(list);
  return log;
}

export function renderMyHandPanel(
  region: HTMLElement,
  viewModel: MyHandPanelViewModel,
): void {
  region.replaceChildren();

  const breakpoint = getDashboardBreakpoint(region);
  const panel = document.createElement('div');
  panel.className = 'my-hand-panel';
  panel.dataset.layout = breakpoint;

  const pocketCards = viewModel.pocketCards ?? [];
  const pocket = pocketCards.length > 0 ? createPocketFaces(pocketCards) : null;

  const money = document.createElement('div');
  money.className = 'my-hand-money';
  money.append(createBankField(viewModel.bank));

  const strength =
    createStrengthSection(viewModel, breakpoint) ??
    (viewModel.outsPhrase ? createOutsField(viewModel.outsPhrase, viewModel.outsCount) : null);

  if (breakpoint === 'phone') {
    if (strength) {
      money.append(strength);
    }
    if (pocket) {
      panel.append(pocket);
    }
    panel.append(money);
    region.append(panel);
    return;
  }

  if (viewModel.sessionDelta !== undefined) {
    const session = createSessionField(viewModel.sessionDelta);
    session.dataset.tone = viewModel.sessionDelta < 0 ? 'danger' : 'success';
    money.append(session);
  }
  if (viewModel.committedThisHand !== undefined) {
    money.append(createCommittedField(viewModel.committedThisHand));
  }

  const top = document.createElement('div');
  top.className = 'my-hand-top';
  if (pocket) {
    top.append(pocket);
  }
  top.append(money);

  const actionLog =
    viewModel.street && viewModel.actionLog !== undefined
      ? createActionLog(viewModel.street, viewModel.actionLog)
      : null;

  const details: HTMLElement[] = [];
  if (strength) {
    details.push(strength);
  }
  if (actionLog) {
    if (details.length > 0) {
      details.push(createDivider());
    }
    details.push(actionLog);
  }

  if (breakpoint === 'tablet') {
    panel.append(top);
    if (details.length > 0) {
      const column = document.createElement('div');
      column.className = 'my-hand-details';
      column.append(...details);
      panel.append(column);
    }
    region.append(panel);
    return;
  }

  panel.append(top);
  if (details.length > 0) {
    panel.append(createDivider(), ...details);
  }
  region.append(panel);
}
