import { publicBase } from './public-base.js';

export interface AssetCard {
  rank: string;
  suit: 'h' | 'd' | 'c' | 's';
}

export function dashboardAssetBase(): string {
  return `${publicBase()}/assets`;
}

const RANKS = new Set(['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']);
const SUITS = new Set(['h', 'd', 'c', 's']);

const RANK_NAMES: Record<string, string> = {
  A: 'Ace',
  K: 'King',
  Q: 'Queen',
  J: 'Jack',
  T: 'Ten',
  '10': 'Ten',
  '9': 'Nine',
  '8': 'Eight',
  '7': 'Seven',
  '6': 'Six',
  '5': 'Five',
  '4': 'Four',
  '3': 'Three',
  '2': 'Two',
};

const SUIT_NAMES: Record<AssetCard['suit'], string> = {
  h: 'Hearts',
  d: 'Diamonds',
  c: 'Clubs',
  s: 'Spades',
};

export function cardAccessibleName(card: AssetCard): string {
  const rankName = RANK_NAMES[card.rank.toUpperCase()] ?? card.rank;
  return `${rankName} of ${SUIT_NAMES[card.suit] ?? card.suit}`;
}

export function cardAssetUrl(card: AssetCard): string | null {
  const rank = card.rank === '10' ? 'T' : card.rank.toUpperCase();
  if (!RANKS.has(rank) || !SUITS.has(card.suit)) {
    return null;
  }
  return `${dashboardAssetBase()}/cards/${rank}${card.suit}.webp`;
}

export function cardBackUrl(): string {
  return `${dashboardAssetBase()}/cards/back-red.webp`;
}

export function iconUrl(name: string): string {
  return `${dashboardAssetBase()}/icons/${name}.svg`;
}

export function brandAssetUrl(name: string): string {
  return `${dashboardAssetBase()}/brand/${name}`;
}

/** The logo lockup; the reverse variant keeps "RIFFLE" legible on felt. */
export function createBrandLockup(className: string, variant: 'reverse' | 'default' = 'reverse'): HTMLImageElement {
  const logo = document.createElement('img');
  logo.className = className;
  logo.src = brandAssetUrl(variant === 'reverse' ? 'riffle-lockup-reverse.svg' : 'riffle-lockup.svg');
  logo.alt = 'Riffle Poker';
  logo.decoding = 'async';
  return logo;
}

export function createBrandMark(className: string): HTMLImageElement {
  const mark = document.createElement('img');
  mark.className = className;
  mark.src = brandAssetUrl('riffle-mark-reverse.svg');
  mark.alt = 'Riffle Poker';
  mark.decoding = 'async';
  return mark;
}

export function createCardImage(card: AssetCard | 'back', className: string): HTMLImageElement {
  const image = document.createElement('img');
  image.className = `playing-card ${className}`;
  image.alt = '';
  image.draggable = false;
  image.decoding = 'async';
  image.src = card === 'back' ? cardBackUrl() : (cardAssetUrl(card) ?? cardBackUrl());
  image.setAttribute('aria-hidden', 'true');
  return image;
}

export function createIcon(name: string, className = 'dashboard-icon'): HTMLImageElement {
  const icon = document.createElement('img');
  icon.className = className;
  icon.src = iconUrl(name);
  icon.alt = '';
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

export function createChip(): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'dashboard-chip';
  chip.setAttribute('aria-hidden', 'true');
  for (const part of ['chip-shadow', 'chip-body', 'chip-inner']) {
    chip.append(createIcon(part, `dashboard-chip-part dashboard-${part}`));
  }
  const mark = document.createElement('span');
  mark.className = 'dashboard-chip-mark';
  mark.textContent = 'R';
  chip.append(mark);
  return chip;
}

export function createVisuallyHidden(text: string): HTMLElement {
  const element = document.createElement('span');
  element.className = 'visually-hidden';
  element.textContent = text;
  return element;
}
