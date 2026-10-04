import { BINGO_BONUS, RACK_SIZE } from './tiles.js';
import type { FormedWord, ScoreBeat } from './types.js';

export interface PlayScore {
  total: number;
  wordScores: number[];
  bingo: boolean;
  /** Ordered count for the client; the caller appends the closing `total` beat. */
  beats: ScoreBeat[];
}

const LETTER_MULTIPLIER = { DL: 2, TL: 3 } as const;
const WORD_MULTIPLIER = { DW: 2, TW: 3 } as const;

/**
 * Scores every word a play forms. Premiums apply only under tiles placed this turn
 * (FormedWord cells carry `premium: null` for tiles already on the board).
 *
 * Beats per word: each tile's face value, then each letter premium, then each word premium,
 * then the word's score. A seven-tile play ends with the 50-point bonus.
 */
export function scorePlay(words: ReadonlyArray<FormedWord>, tilesPlaced: number): PlayScore {
  const beats: ScoreBeat[] = [];
  const wordScores: number[] = [];
  let completed = 0;

  words.forEach((word, index) => {
    let sum = 0;
    for (const cell of word.cells) {
      sum += cell.value;
      beats.push({
        kind: 'tile',
        word: index,
        row: cell.row,
        col: cell.col,
        letter: cell.letter,
        value: cell.value,
        isNew: cell.isNew,
        running: completed + sum,
      });
    }
    for (const cell of word.cells) {
      if (cell.premium === 'DL' || cell.premium === 'TL') {
        const add = cell.value * (LETTER_MULTIPLIER[cell.premium] - 1);
        sum += add;
        beats.push({
          kind: 'letter_premium',
          word: index,
          premium: cell.premium,
          row: cell.row,
          col: cell.col,
          add,
          running: completed + sum,
        });
      }
    }
    for (const cell of word.cells) {
      if (cell.premium === 'DW' || cell.premium === 'TW') {
        const multiplier = WORD_MULTIPLIER[cell.premium];
        sum *= multiplier;
        beats.push({
          kind: 'word_premium',
          word: index,
          premium: cell.premium,
          row: cell.row,
          col: cell.col,
          multiplier,
          running: completed + sum,
        });
      }
    }
    completed += sum;
    wordScores.push(sum);
    beats.push({ kind: 'word', word: index, text: word.text, score: sum, running: completed });
  });

  const bingo = tilesPlaced === RACK_SIZE;
  if (bingo) {
    completed += BINGO_BONUS;
    beats.push({ kind: 'bingo', add: BINGO_BONUS, running: completed });
  }

  return { total: completed, wordScores, bingo, beats };
}
