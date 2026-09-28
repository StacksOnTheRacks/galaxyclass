import type { HandRankCategory } from './rank.js';

const VALUE_NAMES: Record<number, [singular: string, plural: string]> = {
  14: ['Ace', 'Aces'],
  13: ['King', 'Kings'],
  12: ['Queen', 'Queens'],
  11: ['Jack', 'Jacks'],
  10: ['Ten', 'Tens'],
  9: ['Nine', 'Nines'],
  8: ['Eight', 'Eights'],
  7: ['Seven', 'Sevens'],
  6: ['Six', 'Sixes'],
  5: ['Five', 'Fives'],
  4: ['Four', 'Fours'],
  3: ['Three', 'Threes'],
  2: ['Two', 'Twos'],
};

function one(value: number | undefined): string {
  return VALUE_NAMES[value ?? 0]?.[0] ?? '';
}

function many(value: number | undefined): string {
  return VALUE_NAMES[value ?? 0]?.[1] ?? '';
}

export interface NamedHand {
  category: HandRankCategory;
  score: number[];
}

export function isRoyalFlush(hand: NamedHand): boolean {
  return hand.category === 'straight_flush' && hand.score[1] === 14;
}

/** Player-facing name such as "Pair of Aces" or "Full House, Kings over Twos". */
export function madeHandName(hand: NamedHand): string {
  const [, a, b] = hand.score;
  switch (hand.category) {
    case 'high_card':
      return `${one(a)} high`;
    case 'pair':
      return `Pair of ${many(a)}`;
    case 'two_pair':
      return `Two Pair, ${many(a)} & ${many(b)}`;
    case 'three_of_a_kind':
      return `Three of a Kind, ${many(a)}`;
    case 'straight':
      return `Straight, ${one(a)} high`;
    case 'flush':
      return `Flush, ${one(a)} high`;
    case 'full_house':
      return `Full House, ${many(a)} over ${many(b)}`;
    case 'four_of_a_kind':
      return `Four of a Kind, ${many(a)}`;
    case 'straight_flush':
      return isRoyalFlush(hand) ? 'Royal Flush' : `Straight Flush, ${one(a)} high`;
  }
}
