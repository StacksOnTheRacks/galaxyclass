import { createDeck, parseCard, rankValue } from '../../rules/cards.js';
import { isRoyalFlush, madeHandName, type NamedHand } from '../../rules/hand-name.js';
import { CATEGORY_ORDER, evaluateSeven, type HandRankCategory } from '../../rules/rank.js';
import type { Card, Street } from '../../rules/types.js';

export interface HandStrength {
  madeHand: string;
  tier?: string;
  /** 1–10 along High card → Royal flush. */
  meterFilled: number;
  outsCount?: number;
  outsPhrase?: string;
}

const IMPROVES_TO: Record<HandRankCategory, string> = {
  high_card: 'high card',
  pair: 'a pair',
  two_pair: 'two pair',
  three_of_a_kind: 'three of a kind',
  straight: 'a straight',
  flush: 'a flush',
  full_house: 'a full house',
  four_of_a_kind: 'four of a kind',
  straight_flush: 'a straight flush',
};

const NEXT_STREET: Partial<Record<Street, string>> = {
  flop: 'turn',
  turn: 'river',
};

type Evaluated = NamedHand;
const isRoyal = isRoyalFlush;

function tierFor(category: HandRankCategory): string {
  switch (category) {
    case 'high_card':
      return 'Weak';
    case 'pair':
      return 'Fair';
    case 'two_pair':
    case 'three_of_a_kind':
      return 'Strong';
    default:
      return 'Monster';
  }
}

function evaluatePocketOnly(hole: [Card, Card]): Evaluated {
  const [high, low] = hole.map((card) => rankValue(parseCard(card).rank)).sort((x, y) => y - x);
  if (high === low) {
    return { category: 'pair', score: [1, high!] };
  }
  return { category: 'high_card', score: [0, high!, low!] };
}

/** Category the shared board makes by itself; fewer than five cards can only pair up. */
function boardOnlyRank(board: Card[]): number {
  if (board.length >= 5) {
    return CATEGORY_ORDER.indexOf(evaluateSeven([board[0]!, board[1]!], board.slice(2)).category);
  }
  const counts = new Map<string, number>();
  for (const card of board) {
    const rank = parseCard(card).rank;
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }
  const groups = [...counts.values()].sort((x, y) => y - x);
  if (groups[0] === 4) return CATEGORY_ORDER.indexOf('four_of_a_kind');
  if (groups[0] === 3) return CATEGORY_ORDER.indexOf('three_of_a_kind');
  if (groups[0] === 2 && groups[1] === 2) return CATEGORY_ORDER.indexOf('two_pair');
  if (groups[0] === 2) return CATEGORY_ORDER.indexOf('pair');
  return 0;
}

/**
 * Counts unseen cards that lift the made-hand category on the next street,
 * ignoring cards that only improve the shared board.
 */
function countOuts(
  hole: [Card, Card],
  board: Card[],
  current: HandRankCategory,
): { count: number; target: HandRankCategory } | null {
  const known = new Set<Card>([...hole, ...board]);
  const currentRank = CATEGORY_ORDER.indexOf(current);
  const byTarget = new Map<HandRankCategory, number>();
  let count = 0;

  for (const card of createDeck()) {
    if (known.has(card)) {
      continue;
    }
    const nextBoard = [...board, card];
    const next = evaluateSeven(hole, nextBoard).category;
    const nextRank = CATEGORY_ORDER.indexOf(next);
    if (nextRank > currentRank && nextRank > boardOnlyRank(nextBoard)) {
      count += 1;
      byTarget.set(next, (byTarget.get(next) ?? 0) + 1);
    }
  }

  if (count === 0) {
    return null;
  }
  const [target] = [...byTarget.entries()].sort(
    (x, y) => y[1] - x[1] || CATEGORY_ORDER.indexOf(y[0]) - CATEGORY_ORDER.indexOf(x[0]),
  )[0]!;
  return { count, target };
}

export function evaluateHandStrength(
  hole: [Card, Card],
  board: Card[],
  street: Street | null,
): HandStrength {
  const preflop = board.length < 3;
  const hand: Evaluated = preflop ? evaluatePocketOnly(hole) : evaluateSeven(hole, board);
  const strength: HandStrength = {
    madeHand: madeHandName(hand),
    meterFilled: isRoyal(hand) ? 10 : CATEGORY_ORDER.indexOf(hand.category) + 1,
  };

  if (preflop) {
    return strength;
  }
  strength.tier = tierFor(hand.category);

  const nextStreet = street ? NEXT_STREET[street] : undefined;
  if (nextStreet && board.length < 5) {
    const outs = countOuts(hole, board, hand.category);
    if (outs) {
      strength.outsCount = outs.count;
      strength.outsPhrase = `Improves to ${IMPROVES_TO[outs.target]} on the ${nextStreet}`;
    }
  }

  return strength;
}
