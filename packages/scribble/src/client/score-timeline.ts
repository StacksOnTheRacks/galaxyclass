import type { LastTurn } from '../rules/game.js';

/**
 * The on-screen count for a committed play, in the order the server scored it: the scoring
 * tiles light up, then each tile's face value, each premium as its own beat, each word's
 * subtotal, the 50-point bonus, and finally the turn total and new score.
 */
export type TimelineStep =
  | { kind: 'highlight'; cells: Array<{ row: number; col: number }>; words: string[]; ms: number }
  | { kind: 'tile'; row: number; col: number; label: string; running: number; ms: number }
  | { kind: 'premium'; premium: 'DL' | 'TL' | 'DW' | 'TW'; row: number; col: number; label: string; running: number; ms: number }
  | { kind: 'word'; text: string; label: string; running: number; ms: number }
  | { kind: 'bingo'; label: string; running: number; ms: number }
  | { kind: 'total'; seatId: string; label: string; total: number; score: number; ms: number };

const DURATION = { highlight: 450, tile: 240, premium: 620, word: 420, bingo: 900, total: 1100 } as const;
const REDUCED_SCALE = 0.35;

const PREMIUM_LABEL = { DL: '2× letter', TL: '3× letter', DW: '2× word', TW: '3× word' } as const;

export function buildTimeline(turn: LastTurn, options: { reducedMotion?: boolean } = {}): TimelineStep[] {
  if (turn.kind !== 'play') {
    return [];
  }
  const scale = options.reducedMotion ? REDUCED_SCALE : 1;
  const ms = (key: keyof typeof DURATION) => Math.round(DURATION[key] * scale);

  const seen = new Set<string>();
  const cells: Array<{ row: number; col: number }> = [];
  for (const word of turn.words) {
    for (const cell of word.cells) {
      const key = `${cell.row},${cell.col}`;
      if (!seen.has(key)) {
        seen.add(key);
        cells.push({ row: cell.row, col: cell.col });
      }
    }
  }

  const steps: TimelineStep[] = [{ kind: 'highlight', cells, words: turn.words.map((w) => w.text), ms: ms('highlight') }];
  for (const beat of turn.beats) {
    switch (beat.kind) {
      case 'tile':
        steps.push({ kind: 'tile', row: beat.row, col: beat.col, label: `+${beat.value}`, running: beat.running, ms: ms('tile') });
        break;
      case 'letter_premium':
        steps.push({
          kind: 'premium',
          premium: beat.premium,
          row: beat.row,
          col: beat.col,
          label: `${PREMIUM_LABEL[beat.premium]} +${beat.add}`,
          running: beat.running,
          ms: ms('premium'),
        });
        break;
      case 'word_premium':
        steps.push({
          kind: 'premium',
          premium: beat.premium,
          row: beat.row,
          col: beat.col,
          label: `${PREMIUM_LABEL[beat.premium]} ×${beat.multiplier}`,
          running: beat.running,
          ms: ms('premium'),
        });
        break;
      case 'word':
        steps.push({ kind: 'word', text: beat.text, label: `${beat.text} ${beat.score}`, running: beat.running, ms: ms('word') });
        break;
      case 'bingo':
        steps.push({ kind: 'bingo', label: `All seven +${beat.add}`, running: beat.running, ms: ms('bingo') });
        break;
      case 'total':
        steps.push({
          kind: 'total',
          seatId: turn.seatId,
          label: `+${beat.total}`,
          total: beat.total,
          score: beat.score,
          ms: ms('total'),
        });
        break;
    }
  }
  return steps;
}

export function timelineDuration(steps: ReadonlyArray<TimelineStep>): number {
  return steps.reduce((sum, step) => sum + step.ms, 0);
}
