import { describe, expect, it } from 'vitest';
import { cycleMark, knownMarks, loadNotes, noteRows, notesKey, saveNotes, setMark } from '../../src/client/notes.js';
import { eventMessage, snapshot } from './support.js';

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe('notepad', () => {
  it('keeps one notepad per table, case, and member', () => {
    expect(notesKey('t1', 2, 'sub-a')).toBe('whodunit.notes.t1.2.sub-a');
  });

  it('cycles blank → no → maybe → has → blank', () => {
    expect(['', 'no', 'maybe', 'has'].map((m) => cycleMark(m as never))).toEqual(['no', 'maybe', 'has', '']);
  });

  it('round-trips marks through storage and drops anything malformed', () => {
    const storage = memoryStorage();
    const marks = setMark(setMark({}, 'rook', '2', 'maybe'), 'vial', '3', 'no');
    saveNotes(storage, 'k', marks);
    expect(loadNotes(storage, 'k')).toEqual({ rook: { '2': 'maybe' }, vial: { '3': 'no' } });
    storage.items.set('bad', JSON.stringify({ rook: { '2': 'sure', '9': 'has' }, nope: { '1': 'has' }, vial: 'x' }));
    expect(loadNotes(storage, 'bad')).toEqual({ rook: {} });
    storage.items.set('junk', '{');
    expect(loadNotes(storage, 'junk')).toEqual({});
    expect(setMark(marks, 'rook', '2', '')).toEqual({ rook: {}, vial: { '3': 'no' } });
  });

  it('fills in your own hand: yours, and nobody else’s', () => {
    const known = knownMarks(snapshot());
    expect(known.finch).toEqual({ '1': 'has', '2': 'no', '3': 'no' });
    expect(known.juniper).toBeUndefined();
  });

  it('marks a card shown to you, and cards laid face up, but never a card shown to someone else', () => {
    const shownToMe = eventMessage({ kind: 'refuted', suggesterSeatId: '1', refuterSeatId: '3', card: 'juniper' }).event;
    const shownToOther = eventMessage({ kind: 'refuted', suggesterSeatId: '2', refuterSeatId: '3' }).event;
    const departed = eventMessage({ kind: 'departed', seatId: '2', reason: 'left', revealed: ['thorne', 'bust'] }).event;
    const known = knownMarks(snapshot({ log: [shownToMe, shownToOther, departed], revealedCards: ['thorne', 'bust'] }));
    expect(known.juniper).toEqual({ '3': 'has' });
    expect(known.thorne).toEqual({ '2': 'has' });
    const rows = noteRows(snapshot({ log: [shownToMe, departed], revealedCards: ['thorne', 'bust'] }), {});
    const thorne = rows.find((row) => row.card === 'thorne')!;
    expect(thorne.public).toBe(true);
    expect(thorne.cleared).toBe(true);
  });

  it('lays out every card against every detective, facts over hunches', () => {
    const rows = noteRows(snapshot(), { finch: { '2': 'maybe' }, duarte: { '2': 'maybe' } });
    expect(rows).toHaveLength(21);
    const finch = rows.find((row) => row.card === 'finch')!;
    expect(finch.cells.find((c) => c.seatId === '2')).toEqual({ seatId: '2', mark: 'no', auto: true });
    const duarte = rows.find((row) => row.card === 'duarte')!;
    expect(duarte.cells.find((c) => c.seatId === '2')).toEqual({ seatId: '2', mark: 'maybe', auto: false });
    expect(duarte.cleared).toBe(false);
  });
});
