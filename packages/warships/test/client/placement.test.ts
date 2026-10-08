// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_DRAFT, type Draft } from '../../src/client/draft.js';
import { BoardView } from '../../src/client/views/board.js';
import { PlacementView } from '../../src/client/views/placement.js';
import type { Fleet } from '../../src/rules/types.js';

const CELL = 40;
const ORIGIN = { left: 100, top: 100 };

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

function setup() {
  document.body.innerHTML = '';
  const board = new BoardView('own', 'Your waters');
  let draft: Draft = EMPTY_DRAFT;
  const announced: string[] = [];
  const readied: Fleet[] = [];
  const view = new PlacementView(board, {
    draft: () => draft,
    setDraft: (next) => (draft = next),
    ready: (fleet) => readied.push(fleet),
    unready: () => {},
    announce: (text) => announced.push(text),
    reducedMotion: () => true,
    lastFleet: () => null,
  });
  const app = document.createElement('div');
  app.className = 'ws-app';
  app.append(board.root, view.panel);
  document.body.append(app);
  // happy-dom has no layout: A1 sits at (100, 100) and cells are 40 px.
  vi.spyOn(board, 'originRect').mockReturnValue(rect(ORIGIN.left, ORIGIN.top, CELL, CELL));
  view.setActive(true);
  view.update({ ready: false, opponentReady: false, opponentName: 'Captain', canUnready: false });
  const tray = (shipId: string) => view.panel.querySelector<HTMLButtonElement>(`.ws-tray-ship[data-ship="${shipId}"]`)!;
  return { board, view, tray, draft: () => draft, announced, readied };
}

const key = (target: Element, k: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

function pointer(target: Element, type: string, x: number, y: number) {
  target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, button: 0, bubbles: true, cancelable: true }));
}

describe('placement', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('carries a ship from the tray with the keyboard: Enter picks up, arrows move, R rotates, Enter drops', () => {
    const t = setup();
    const carrier = t.tray('carrier');
    expect(carrier.getAttribute('aria-label')).toBe('Carrier, 5 cells. Enter to pick up.');
    key(carrier, 'Enter');
    expect(t.announced.at(-1)).toBe('Carrier picked up. Carrier at A1 to A5, horizontal. Arrow keys move, R rotates, Enter drops, Escape cancels.');
    const carried = t.board.shipElement('carrier')!;
    expect(carried.dataset.state).toBe('carrying');
    expect(document.activeElement).toBe(carried);

    key(carried, 'ArrowDown');
    key(carried, 'ArrowDown');
    key(carried, 'ArrowRight');
    expect(t.announced.at(-1)).toBe('Carrier at C2 to C6, horizontal.');
    key(carried, 'r');
    expect(t.announced.at(-1)).toBe('Carrier at C2 to G2, vertical.');
    key(carried, 'Enter');
    expect(t.draft().carrier).toEqual({ shipId: 'carrier', row: 2, col: 1, orientation: 'vertical' });
    expect(t.announced.at(-1)).toBe('Placed. Carrier at C2 to G2, vertical.');
    expect(t.tray('carrier').disabled).toBe(true);
  });

  it('will not drop a carried ship on another, and Escape puts it back', () => {
    const t = setup();
    key(t.tray('carrier'), 'Enter');
    key(t.board.shipElement('carrier')!, 'Enter');
    key(t.tray('destroyer'), 'Enter');
    // The first open spot skips the carrier's row.
    expect(t.announced.at(-1)).toContain('Destroyer at A6 to A7, horizontal.');
    const destroyer = t.board.shipElement('destroyer')!;
    key(destroyer, 'ArrowLeft');
    expect(t.announced.at(-1)).toBe('Destroyer at A5 to A6, horizontal. Blocked.');
    key(destroyer, 'Enter');
    expect(t.announced.at(-1)).toBe('Destroyer does not fit there.');
    key(destroyer, 'Escape');
    expect(t.announced.at(-1)).toBe('Destroyer put back.');
    expect(t.draft().destroyer).toBeNull();
  });

  it('drags from the tray by the label as if holding the middle of the hull', () => {
    const t = setup();
    const button = t.tray('cruiser');
    const hull = button.querySelector('.ws-hull')!;
    vi.spyOn(hull, 'getBoundingClientRect').mockReturnValue(rect(700, 300, 90, 30));
    const label = button.querySelector('.ws-tray-label')!;
    // Press on the label, right of the hull, and drop with the pointer over D5 (row 3, col 4).
    pointer(label, 'pointerdown', 820, 315);
    pointer(label, 'pointermove', 600, 300);
    pointer(label, 'pointermove', ORIGIN.left + 4.5 * CELL, ORIGIN.top + 3.5 * CELL);
    expect(document.querySelector('.ws-ghost')).not.toBeNull();
    expect(t.board.cells[3]![3]!.dataset.preview).toBe('valid');
    pointer(label, 'pointerup', ORIGIN.left + 4.5 * CELL, ORIGIN.top + 3.5 * CELL);
    // The cruiser's middle segment lands under the pointer: D4 to D6.
    expect(t.draft().cruiser).toEqual({ shipId: 'cruiser', row: 3, col: 3, orientation: 'horizontal' });
    expect(t.announced.at(-1)).toBe('Cruiser at D4 to D6, horizontal.');
    expect(document.querySelector('.ws-ghost')).toBeNull();
  });

  it('reverts a drop that hangs off the board', () => {
    const t = setup();
    const button = t.tray('battleship');
    vi.spyOn(button.querySelector('.ws-hull')!, 'getBoundingClientRect').mockReturnValue(rect(700, 300, 120, 30));
    pointer(button, 'pointerdown', 705, 315); // the bow
    pointer(button, 'pointermove', ORIGIN.left + 8.5 * CELL, ORIGIN.top + 0.5 * CELL);
    expect(t.board.cells[0]![9]!.dataset.preview).toBe('invalid');
    pointer(button, 'pointerup', ORIGIN.left + 8.5 * CELL, ORIGIN.top + 0.5 * CELL);
    expect(t.draft().battleship).toBeNull();
    expect(t.announced.at(-1)).toBe('Battleship does not fit there.');
  });

  it('randomizes a legal fleet and readies it', () => {
    const t = setup();
    const buttons = [...t.view.panel.querySelectorAll<HTMLButtonElement>('button')];
    const ready = buttons.find((b) => b.textContent === 'Ready')!;
    expect(ready.disabled).toBe(true);
    buttons.find((b) => b.textContent === 'Randomize')!.click();
    expect(Object.values(t.draft()).every(Boolean)).toBe(true);
    expect(ready.disabled).toBe(false);
    ready.click();
    expect(t.readied).toHaveLength(1);
    expect(t.readied[0]!.map((p) => p.shipId)).toEqual(['carrier', 'battleship', 'cruiser', 'submarine', 'destroyer']);
  });

  it('shows the opponent’s readiness and locks the fleet once ready', () => {
    const t = setup();
    t.view.update({ ready: true, opponentReady: false, opponentName: 'Captain', canUnready: true });
    const chip = t.view.panel.querySelector('.ws-ready-chip')!;
    expect(chip.textContent).toBe('Captain is deploying…');
    expect(t.view.panel.querySelector<HTMLElement>('.ws-tray')!.hidden).toBe(true);
    const edit = [...t.view.panel.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Edit fleet')!;
    expect(edit.hidden).toBe(false);
    t.view.update({ ready: true, opponentReady: true, opponentName: 'Captain', canUnready: false });
    expect(chip.textContent).toBe('Captain is ready');
    expect(edit.hidden).toBe(true);
  });
});
