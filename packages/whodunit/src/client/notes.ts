import type { CardId, SeatId, TableSnapshot } from '../protocol.js';
import { ALL_CARDS, cardKind, cardName } from './cards.js';

/**
 * The detective's notepad: a mark per card per detective, kept only in this browser. `has` means
 * that detective holds the card, `no` that they do not, `maybe` a hunch. Facts the game has shown
 * you (your own hand, a card shown to you, cards laid face up) are filled in for you and cannot be
 * overwritten.
 */
export type NoteMark = '' | 'no' | 'maybe' | 'has';

export const MARK_CYCLE: readonly NoteMark[] = ['', 'no', 'maybe', 'has'];

export type NoteMarks = Partial<Record<CardId, Partial<Record<SeatId, NoteMark>>>>;

export interface NoteCell {
  seatId: SeatId;
  mark: NoteMark;
  /** Filled in from what the game showed you. */
  auto: boolean;
}

export interface NoteRow {
  card: CardId;
  kind: ReturnType<typeof cardKind>;
  name: string;
  cells: NoteCell[];
  /** Someone is known to hold it, so it is not in the case file. */
  cleared: boolean;
  /** Laid face up for everyone when its holder left. */
  public: boolean;
}

export type NotesStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** One notepad per table, per case, per member, so a new case starts clean and accounts never share. */
export function notesKey(tableId: string, gameNumber: number, member: string): string {
  return `whodunit.notes.${tableId}.${gameNumber}.${member}`;
}

const CARDS = new Set<string>(ALL_CARDS);
const MARKS = new Set<string>(MARK_CYCLE);

export function loadNotes(storage: NotesStorage | null, key: string): NoteMarks {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(key) ?? null;
  } catch {
    return {};
  }
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }
    const marks: NoteMarks = {};
    for (const [card, row] of Object.entries(parsed as Record<string, unknown>)) {
      if (!CARDS.has(card) || typeof row !== 'object' || row === null) {
        continue;
      }
      const clean: Partial<Record<SeatId, NoteMark>> = {};
      for (const [seatId, mark] of Object.entries(row as Record<string, unknown>)) {
        if (/^[1-6]$/.test(seatId) && typeof mark === 'string' && MARKS.has(mark) && mark !== '') {
          clean[seatId as SeatId] = mark as NoteMark;
        }
      }
      marks[card as CardId] = clean;
    }
    return marks;
  } catch {
    return {};
  }
}

export function saveNotes(storage: NotesStorage | null, key: string, marks: NoteMarks): void {
  try {
    storage?.setItem(key, JSON.stringify(marks));
  } catch {
    // Private mode or full storage: the notepad still works for this visit.
  }
}

export function cycleMark(mark: NoteMark): NoteMark {
  return MARK_CYCLE[(MARK_CYCLE.indexOf(mark) + 1) % MARK_CYCLE.length]!;
}

export function setMark(marks: NoteMarks, card: CardId, seatId: SeatId, mark: NoteMark): NoteMarks {
  const row = { ...(marks[card] ?? {}) };
  if (mark === '') {
    delete row[seatId];
  } else {
    row[seatId] = mark;
  }
  return { ...marks, [card]: row };
}

/**
 * What the game has told this detective for certain: their own hand (theirs, nobody else's), every
 * card shown to them in a refutation, and the cards of anyone who left. Built only from the
 * viewer's own snapshot, so it can never know more than the server let it see.
 */
export function knownMarks(snapshot: TableSnapshot): NoteMarks {
  const me = snapshot.you?.seatId;
  let marks: NoteMarks = {};
  if (!me) {
    return marks;
  }
  for (const card of snapshot.you?.hand ?? []) {
    for (const seatId of snapshot.players) {
      marks = setMark(marks, card, seatId, seatId === me ? 'has' : 'no');
    }
  }
  for (const event of snapshot.log) {
    if (event.kind === 'refuted' && event.card && event.suggesterSeatId === me) {
      marks = setMark(marks, event.card, event.refuterSeatId, 'has');
    }
    if (event.kind === 'departed') {
      for (const card of event.revealed) {
        marks = setMark(marks, card, event.seatId, 'has');
      }
    }
  }
  return marks;
}

export function noteRows(snapshot: TableSnapshot, marks: NoteMarks): NoteRow[] {
  const known = knownMarks(snapshot);
  const revealed = new Set(snapshot.revealedCards);
  return ALL_CARDS.map((card) => {
    const cells = snapshot.players.map((seatId) => {
      const fact = known[card]?.[seatId];
      return fact ? { seatId, mark: fact, auto: true } : { seatId, mark: marks[card]?.[seatId] ?? '', auto: false };
    });
    return {
      card,
      kind: cardKind(card),
      name: cardName(card),
      cells,
      cleared: revealed.has(card) || cells.some((cell) => cell.mark === 'has'),
      public: revealed.has(card),
    };
  });
}
