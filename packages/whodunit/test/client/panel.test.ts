// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { namesFor } from '../../src/client/narrate.js';
import { noteRows } from '../../src/client/notes.js';
import { viewModel } from '../../src/client/view-model.js';
import { Panel, type PanelIntents } from '../../src/client/views/panel.js';
import type { TableSnapshot } from '../../src/protocol.js';
import { startPositions } from '../../src/rules/board.js';
import { eventMessage, snapshot, turn, you } from './support.js';

function panel(state: TableSnapshot) {
  const intents: { [K in keyof PanelIntents]: ReturnType<typeof vi.fn> } = {
    roll: vi.fn(),
    takePassage: vi.fn(),
    move: vi.fn(),
    suggest: vi.fn(),
    showCard: vi.fn(),
    accuse: vi.fn(),
    endTurn: vi.fn(),
    cycleNote: vi.fn(),
  };
  const view = new Panel(intents as unknown as PanelIntents);
  document.body.replaceChildren(view.root);
  const update = (next: TableSnapshot) =>
    view.update({ vm: viewModel(next, { serverNow: 5_000, resolving: false }), snapshot: next, notes: noteRows(next, {}), names: namesFor(next.seats, '1') });
  update(state);
  const q = <T extends HTMLElement = HTMLElement>(testid: string) => view.root.querySelector<T>(`[data-testid="${testid}"]`)!;
  return { view, intents, q, update };
}

const inParlor = { ...startPositions(), vesper: { kind: 'room' as const, room: 'parlor' as const } };

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('control panel', () => {
  it('offers Roll at the start of your turn and hides it otherwise', () => {
    const { q, intents, update } = panel(snapshot());
    expect(q('roll').hidden).toBe(false);
    expect(q<HTMLButtonElement>('roll').disabled).toBe(false);
    q('roll').click();
    expect(intents.roll).toHaveBeenCalled();
    update(snapshot({ currentSeatId: '2' }));
    expect(q('roll').hidden).toBe(true);
    expect(q('end-turn').hidden).toBe(true);
  });

  it('lays your hand out as illustrated cards', () => {
    const { q } = panel(snapshot());
    const card = q('hand-card-rook');
    expect(card.classList.contains('wd-card')).toBe(true);
    expect(card.querySelector('.wd-card-name')?.textContent).toBe('Captain Rook');
    expect(card.querySelector('svg.wd-card-art')).not.toBeNull();
    expect(q('hand').querySelectorAll('.wd-card')).toHaveLength(6);
  });

  it('shows the dice, and the rooms within reach as buttons', () => {
    const { q, intents } = panel(snapshot({ turn: turn({ phase: 'moving', dice: [6, 6] }) }));
    expect(q('dice').getAttribute('aria-label')).toBe('Dice: 6 and 6, 12');
    const room = q('dest-room-gallery');
    expect(room.textContent).toBe('Portrait Gallery');
    room.click();
    expect(intents.move).toHaveBeenCalledWith({ kind: 'room', room: 'gallery' });
  });

  it('makes a suggestion with the room fixed to where you stand', () => {
    const { q, intents } = panel(snapshot({ positions: inParlor, turn: turn({ phase: 'moved', enteredRoom: 'parlor', dice: [3, 3] }) }));
    expect(q('suggest-open').hidden).toBe(false);
    q('suggest-open').click();
    expect(q('suggest-dialog').hidden).toBe(false);
    expect(q('suggest-dialog').textContent).toContain('In the Parlor');
    expect(q<HTMLButtonElement>('suggest-submit').disabled).toBe(true);
    q('suggest-suspect-rook').click();
    q('suggest-weapon-vial').click();
    expect(q('suggest-suspect-rook').getAttribute('aria-pressed')).toBe('true');
    q('suggest-submit').click();
    expect(intents.suggest).toHaveBeenCalledWith('rook', 'vial');
    expect(q('suggest-dialog').hidden).toBe(true);
  });

  it('asks you to confirm an accusation before opening the case file', () => {
    const { q, intents } = panel(snapshot({ positions: inParlor, turn: turn({ phase: 'moved', dice: [2, 2] }) }));
    q('accuse-open').click();
    expect(q('accuse-room-parlor').getAttribute('aria-pressed')).toBe('true');
    q('accuse-suspect-duarte').click();
    q('accuse-weapon-bust').click();
    q('accuse-room-foyer').click();
    q('accuse-submit').click();
    expect(intents.accuse).not.toHaveBeenCalled();
    expect(q('accuse-dialog').textContent).toContain('Chef Duarte with the Marble Bust in the Grand Foyer?');
    q('accuse-confirm').click();
    expect(intents.accuse).toHaveBeenCalledWith('duarte', 'bust', 'foyer');
  });

  it('prompts only the refuter, offering only the matching cards', () => {
    const refuting = snapshot({
      currentSeatId: '2',
      turn: turn({ phase: 'refuting', refuterSeatId: '1' }),
      you: you({ refute: { suggesterSeatId: '2', suggestion: { suspect: 'rook', weapon: 'vial', room: 'parlor' }, matching: ['rook', 'vial'] } }),
    });
    const { q, intents, update } = panel(refuting);
    expect(q('refute-prompt').hidden).toBe(false);
    expect(q('refute-prompt').textContent).toContain('Sleuth suggests Captain Rook with the Poison Vial in the Parlor.');
    expect(q('refute-prompt').querySelectorAll('button')).toHaveLength(2);
    expect(q('refute-prompt').querySelector('[data-testid="refute-card-parlor"]')).toBeNull();
    q('refute-card-vial').click();
    expect(intents.showCard).toHaveBeenCalledWith('vial');
    update(snapshot({ currentSeatId: '2' }));
    expect(q('refute-prompt').hidden).toBe(true);
  });

  it('keeps a notepad with your hand already filled in, and cycles the rest', () => {
    const { q, intents } = panel(snapshot());
    const known = q<HTMLButtonElement>('note-rook-1');
    expect(known.dataset.mark).toBe('has');
    expect(known.disabled).toBe(true);
    expect(q('note-rook-2').dataset.mark).toBe('no');
    const open = q<HTMLButtonElement>('note-duarte-2');
    expect(open.disabled).toBe(false);
    expect(open.getAttribute('aria-label')).toBe('Chef Duarte: Sleuth unknown');
    open.click();
    expect(intents.cycleNote).toHaveBeenCalledWith('duarte', '2');
  });

  it('logs the case newest first, naming a shown card only to the two who saw it', () => {
    const toMe = eventMessage({ kind: 'refuted', suggesterSeatId: '1', refuterSeatId: '2', card: 'juniper', seq: 1 }).event;
    const toThem = eventMessage({ kind: 'refuted', suggesterSeatId: '3', refuterSeatId: '2', seq: 2 }).event;
    const { q } = panel(snapshot({ log: [toMe, toThem] }));
    expect([...q('event-log').querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Sleuth showed Gumshoe a card.',
      'Sleuth showed you Juniper Lark.',
    ]);
  });
});
