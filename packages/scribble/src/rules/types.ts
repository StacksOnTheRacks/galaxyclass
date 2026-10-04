/** A tile in the bag or on a rack. `letter` is null for a blank until it is played. */
export interface Tile {
  id: string;
  letter: string | null;
}

/** A committed tile on the board. A blank keeps the letter chosen when its play committed. */
export interface BoardTile {
  row: number;
  col: number;
  letter: string;
  blank: boolean;
  tileId: string;
}

/** One tile the player wants to place this turn. `letter` is only sent for a blank. */
export interface Placement {
  tileId: string;
  row: number;
  col: number;
  letter?: string;
}

export type Premium = 'DL' | 'TL' | 'DW' | 'TW';

export interface WordCell {
  row: number;
  col: number;
  letter: string;
  value: number;
  isNew: boolean;
  premium: Premium | null;
}

export interface FormedWord {
  text: string;
  cells: WordCell[];
}

/**
 * One step of the on-screen count. Every seat replays the same beats after a commit.
 * `running` is the turn total after this beat.
 */
export type ScoreBeat =
  | { kind: 'tile'; word: number; row: number; col: number; letter: string; value: number; isNew: boolean; running: number }
  | { kind: 'letter_premium'; word: number; premium: 'DL' | 'TL'; row: number; col: number; add: number; running: number }
  | { kind: 'word_premium'; word: number; premium: 'DW' | 'TW'; row: number; col: number; multiplier: number; running: number }
  | { kind: 'word'; word: number; text: string; score: number; running: number }
  | { kind: 'bingo'; add: number; running: number }
  | { kind: 'total'; total: number; score: number };

export type PlacementError =
  | 'empty'
  | 'too_many_tiles'
  | 'duplicate_tile'
  | 'not_your_tile'
  | 'off_board'
  | 'occupied'
  | 'duplicate_square'
  | 'blank_letter_required'
  | 'invalid_letter'
  | 'not_in_line'
  | 'gap'
  | 'must_cover_center'
  | 'too_short'
  | 'not_connected';
