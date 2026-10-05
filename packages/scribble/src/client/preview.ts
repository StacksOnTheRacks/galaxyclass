import { checkPlacement } from '../rules/placement.js';
import { scorePlay } from '../rules/score.js';
import type { PlacementError, Tile } from '../rules/types.js';
import type { TableSnapshot } from '../runtime/types.js';
import { draftPlacements, placedCount, type Draft } from './draft.js';

/**
 * What the draft on the board would do if played now. Geometry and score come from the same
 * rules the server runs; whether each word is in the list is asked of the server.
 */
export type Preview =
  | { kind: 'none' }
  | { kind: 'blank' }
  | { kind: 'invalid'; reason: PlacementError }
  | { kind: 'words'; words: Array<{ text: string; score: number }>; total: number; bingo: boolean };

export const NO_PREVIEW: Preview = { kind: 'none' };

export function previewDraft(board: TableSnapshot['board'], rack: ReadonlyArray<Tile>, draft: Draft): Preview {
  if (placedCount(draft) === 0) {
    return NO_PREVIEW;
  }
  const result = draftPlacements(draft, rack);
  if (!result.ok) {
    return { kind: 'blank' };
  }
  const placement = checkPlacement(
    board.map((tile) => ({ ...tile, tileId: '' })),
    rack,
    result.placements,
  );
  if (!placement.ok) {
    return { kind: 'invalid', reason: placement.reason };
  }
  const score = scorePlay(placement.words, placement.placed.length);
  return {
    kind: 'words',
    words: placement.words.map((word, index) => ({ text: word.text, score: score.wordScores[index]! })),
    total: score.total,
    bingo: score.bingo,
  };
}

export type Verdict =
  | { state: 'none' | 'blank' | 'checking' | 'valid' }
  | { state: 'placement'; reason: PlacementError }
  | { state: 'rejected'; words: string[] };

export function verdictFor(preview: Preview, validity: ReadonlyMap<string, boolean>): Verdict {
  switch (preview.kind) {
    case 'none':
    case 'blank':
      return { state: preview.kind };
    case 'invalid':
      return { state: 'placement', reason: preview.reason };
    case 'words': {
      const rejected = [...new Set(preview.words.filter((word) => validity.get(word.text) === false).map((w) => w.text))];
      if (rejected.length > 0) {
        return { state: 'rejected', words: rejected };
      }
      return { state: preview.words.every((word) => validity.get(word.text) === true) ? 'valid' : 'checking' };
    }
  }
}
