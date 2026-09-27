import type { Card, Rank, Suit } from './types.js';

const RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS: Suit[] = ['s', 'h', 'd', 'c'];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push(`${rank}${suit}`);
    }
  }
  return deck;
}

export function parseCard(card: Card): { rank: Rank; suit: Suit } {
  return { rank: card[0] as Rank, suit: card[1] as Suit };
}

export function rankValue(rank: Rank): number {
  switch (rank) {
    case 'A':
      return 14;
    case 'K':
      return 13;
    case 'Q':
      return 12;
    case 'J':
      return 11;
    case 'T':
      return 10;
    default:
      return Number.parseInt(rank, 10);
  }
}

export function shuffleDeck(deck: Card[], rng: { nextInt(maxExclusive: number): number }): Card[] {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
