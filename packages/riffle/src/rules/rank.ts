import { parseCard, rankValue } from './cards.js';
import type { Card, Rank } from './types.js';

export type HandRankCategory =
  | 'high_card'
  | 'pair'
  | 'two_pair'
  | 'three_of_a_kind'
  | 'straight'
  | 'flush'
  | 'full_house'
  | 'four_of_a_kind'
  | 'straight_flush';

export type EvaluatedHand = {
  category: HandRankCategory;
  rankName: string;
  /** Higher is better; tuple compared lexicographically. */
  score: number[];
};

const CATEGORY_ORDER: HandRankCategory[] = [
  'high_card',
  'pair',
  'two_pair',
  'three_of_a_kind',
  'straight',
  'flush',
  'full_house',
  'four_of_a_kind',
  'straight_flush',
];

const CATEGORY_NAME: Record<HandRankCategory, string> = {
  high_card: 'high card',
  pair: 'pair',
  two_pair: 'two pair',
  three_of_a_kind: 'three of a kind',
  straight: 'straight',
  flush: 'flush',
  full_house: 'full house',
  four_of_a_kind: 'four of a kind',
  straight_flush: 'straight flush',
};

function compareScores(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) {
      return av - bv;
    }
  }
  return 0;
}

function cardValues(cards: Card[]): number[] {
  return cards.map((c) => rankValue(parseCard(c).rank)).sort((a, b) => b - a);
}

function isStraight(values: number[]): number | null {
  const uniq = [...new Set(values)].sort((a, b) => b - a);
  if (uniq.length < 5) {
    return null;
  }
  for (let i = 0; i <= uniq.length - 5; i += 1) {
    const slice = uniq.slice(i, i + 5);
    if (slice[0] - slice[4] === 4) {
      return slice[0];
    }
  }
  // wheel A-2-3-4-5
  if (uniq.includes(14) && uniq.includes(5) && uniq.includes(4) && uniq.includes(3) && uniq.includes(2)) {
    return 5;
  }
  return null;
}

function countByRank(cards: Card[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of cards) {
    const v = rankValue(parseCard(card).rank);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
}

function evaluateFive(cards: Card[]): EvaluatedHand {
  if (cards.length !== 5) {
    throw new Error('evaluateFive requires exactly 5 cards');
  }

  const values = cardValues(cards);
  const counts = countByRank(cards);
  const entries = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1];
    }
    return b[0] - a[0];
  });

  const suits = cards.map((c) => parseCard(c).suit);
  const isFlush = suits.every((s) => s === suits[0]);
  const straightHigh = isStraight(values);

  if (isFlush && straightHigh !== null) {
    return {
      category: 'straight_flush',
      rankName: CATEGORY_NAME.straight_flush,
      score: [CATEGORY_ORDER.indexOf('straight_flush'), straightHigh],
    };
  }

  if (entries[0][1] === 4) {
    const quad = entries[0][0];
    const kicker = entries[1][0];
    return {
      category: 'four_of_a_kind',
      rankName: CATEGORY_NAME.four_of_a_kind,
      score: [CATEGORY_ORDER.indexOf('four_of_a_kind'), quad, kicker],
    };
  }

  if (entries[0][1] === 3 && entries[1][1] === 2) {
    return {
      category: 'full_house',
      rankName: CATEGORY_NAME.full_house,
      score: [CATEGORY_ORDER.indexOf('full_house'), entries[0][0], entries[1][0]],
    };
  }

  if (isFlush) {
    return {
      category: 'flush',
      rankName: CATEGORY_NAME.flush,
      score: [CATEGORY_ORDER.indexOf('flush'), ...values],
    };
  }

  if (straightHigh !== null) {
    return {
      category: 'straight',
      rankName: CATEGORY_NAME.straight,
      score: [CATEGORY_ORDER.indexOf('straight'), straightHigh],
    };
  }

  if (entries[0][1] === 3) {
    const kickers = entries.filter((e) => e[1] === 1).map((e) => e[0]).sort((a, b) => b - a);
    return {
      category: 'three_of_a_kind',
      rankName: CATEGORY_NAME.three_of_a_kind,
      score: [CATEGORY_ORDER.indexOf('three_of_a_kind'), entries[0][0], ...kickers],
    };
  }

  if (entries[0][1] === 2 && entries[1][1] === 2) {
    const highPair = Math.max(entries[0][0], entries[1][0]);
    const lowPair = Math.min(entries[0][0], entries[1][0]);
    const kicker = entries.find((e) => e[1] === 1)![0];
    return {
      category: 'two_pair',
      rankName: CATEGORY_NAME.two_pair,
      score: [CATEGORY_ORDER.indexOf('two_pair'), highPair, lowPair, kicker],
    };
  }

  if (entries[0][1] === 2) {
    const kickers = entries.filter((e) => e[1] === 1).map((e) => e[0]).sort((a, b) => b - a);
    return {
      category: 'pair',
      rankName: CATEGORY_NAME.pair,
      score: [CATEGORY_ORDER.indexOf('pair'), entries[0][0], ...kickers],
    };
  }

  return {
    category: 'high_card',
    rankName: CATEGORY_NAME.high_card,
    score: [CATEGORY_ORDER.indexOf('high_card'), ...values],
  };
}

function combinations<T>(items: T[], choose: number): T[][] {
  const result: T[][] = [];
  function helper(start: number, combo: T[]): void {
    if (combo.length === choose) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i <= items.length - (choose - combo.length); i += 1) {
      combo.push(items[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return result;
}

export function evaluateSeven(hole: [Card, Card], board: Card[]): EvaluatedHand {
  const all = [hole[0], hole[1], ...board];
  let best: EvaluatedHand | null = null;
  for (const five of combinations(all, 5)) {
    const evald = evaluateFive(five);
    if (!best || compareScores(evald.score, best.score) > 0) {
      best = evald;
    }
  }
  return best!;
}

export function compareEvaluated(a: EvaluatedHand, b: EvaluatedHand): number {
  return compareScores(a.score, b.score);
}
