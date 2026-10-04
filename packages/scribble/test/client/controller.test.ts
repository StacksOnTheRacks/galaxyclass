import { describe, expect, it, vi } from 'vitest';
import { worldToScreen } from '../../src/client/camera.js';
import { describeError, TableController, type ControllerUi, type SessionPort } from '../../src/client/controller.js';
import { cellCenter, rackSlots } from '../../src/client/layout.js';
import { TableModel } from '../../src/client/model.js';
import type { LastTurn } from '../../src/rules/game.js';
import type { Tile } from '../../src/rules/types.js';
import { snapshot } from '../support/snapshots.js';

const RACK: Tile[] = [
  { id: 'c', letter: 'C' },
  { id: 'a', letter: 'A' },
  { id: 't', letter: 'T' },
  { id: 'q', letter: null },
];

function setup(options: { blank?: string | null } = {}) {
  const model = new TableModel(1280, 900);
  const session: SessionPort & { calls: unknown[][] } = {
    seated: true,
    calls: [],
    play(placements) {
      this.calls.push(['play', placements]);
    },
    pass() {
      this.calls.push(['pass']);
    },
    exchange(ids) {
      this.calls.push(['exchange', ids]);
    },
    startGame() {
      this.calls.push(['start']);
    },
    setTheme(id) {
      this.calls.push(['theme', id]);
    },
    leave() {
      this.calls.push(['leave']);
    },
    sit() {
      this.calls.push(['sit']);
    },
  };
  const toasts: string[] = [];
  const ui: ControllerUi = {
    pickBlank: vi.fn(async () => options.blank ?? null),
    toast: (text) => toasts.push(text),
  };
  const scheduled: Array<{ fn: () => void; at: number }> = [];
  const controller = new TableController(model, session, ui, {
    schedule: (fn, at) => scheduled.push({ fn, at }),
    random: { int: () => 0 },
  });
  controller.onSnapshot(snapshot({ rack: RACK }));
  return { model, session, ui, toasts, scheduled, controller };
}

function rackPoint(model: TableModel, tileId: string) {
  const tiles = model.rackTiles;
  return rackSlots(model.layout, tiles.length)[tiles.findIndex((t) => t.id === tileId)]!;
}

function squarePoint(model: TableModel, row: number, col: number) {
  const c = cellCenter(row, col);
  return worldToScreen(model.camera, model.layout.board, c.x, c.y);
}

function drag(controller: TableController, from: { x: number; y: number }, to: { x: number; y: number }) {
  controller.pointerDown(1, from.x, from.y);
  controller.pointerMove(1, (from.x + to.x) / 2, (from.y + to.y) / 2);
  controller.pointerMove(1, to.x, to.y);
  controller.pointerUp(1, to.x, to.y);
}

describe('table controller', () => {
  it('drags rack tiles onto squares and plays only tile ids and squares', async () => {
    const { model, session, controller } = setup();
    drag(controller, rackPoint(model, 'c'), squarePoint(model, 7, 7));
    drag(controller, rackPoint(model, 'a'), squarePoint(model, 7, 8));
    expect(model.draft.placed).toEqual({ c: { row: 7, col: 7, letter: null }, a: { row: 7, col: 8, letter: null } });
    await controller.play();
    expect(session.calls).toEqual([
      [
        'play',
        [
          { tileId: 'c', row: 7, col: 7 },
          { tileId: 'a', row: 7, col: 8 },
        ],
      ],
    ]);
  });

  it('picks a draft tile back up and returns it to the rack when dropped off the board', () => {
    const { model, controller } = setup();
    drag(controller, rackPoint(model, 't'), squarePoint(model, 2, 2));
    expect(model.draft.placed.t).toBeDefined();
    drag(controller, squarePoint(model, 2, 2), { x: 640, y: model.layout.rack.y + model.layout.rack.height / 2 });
    expect(model.draft.placed.t).toBeUndefined();
    expect(model.rackTiles.map((t) => t.id)).toContain('t');
  });

  it('will not drop on a committed tile', () => {
    const { model, controller } = setup();
    controller.onSnapshot(snapshot({ rack: RACK, board: [{ row: 7, col: 7, letter: 'S', blank: false }] }));
    drag(controller, rackPoint(model, 'c'), squarePoint(model, 7, 7));
    expect(model.draft.placed).toEqual({});
  });

  it('asks for a blank letter on drop and returns the blank if the player backs out', async () => {
    const chosen = setup({ blank: 'E' });
    drag(chosen.controller, rackPoint(chosen.model, 'q'), squarePoint(chosen.model, 7, 7));
    await vi.waitFor(() => expect(chosen.model.draft.placed.q?.letter).toBe('E'));

    const declined = setup({ blank: null });
    drag(declined.controller, rackPoint(declined.model, 'q'), squarePoint(declined.model, 7, 7));
    await vi.waitFor(() => expect(declined.model.draft.placed.q).toBeUndefined());
  });

  it('does not let you play off turn', async () => {
    const { model, session, controller, toasts } = setup();
    controller.onSnapshot(snapshot({ rack: RACK, currentSeatId: '2' }));
    drag(controller, rackPoint(model, 'c'), squarePoint(model, 7, 7));
    await controller.play();
    expect(session.calls).toEqual([]);
    expect(toasts.at(-1)).toBe("It's not your turn.");
  });

  it('exchanges only the tiles tapped while exchanging', () => {
    const { model, session, controller } = setup();
    controller.beginExchange();
    for (const id of ['c', 't']) {
      const p = rackPoint(model, id);
      controller.pointerDown(1, p.x, p.y);
      controller.pointerUp(1, p.x, p.y);
    }
    controller.confirmExchange();
    expect(session.calls).toEqual([['exchange', ['c', 't']]]);
  });

  it('wheel-zooms only over the board', () => {
    const { model, controller } = setup();
    const before = model.camera.zoom;
    controller.wheel(10, model.layout.rack.y + 5, -120);
    expect(model.camera.zoom).toBe(before);
    const center = squarePoint(model, 7, 7);
    controller.wheel(center.x, center.y, -120);
    expect(model.camera.zoom).toBeGreaterThan(before);
  });

  it('plays the count for a new play in beat order and holds the score until the total', () => {
    const { model, controller, scheduled } = setup();
    const lastTurn: LastTurn = {
      turnNumber: 1,
      seatId: '2',
      kind: 'play',
      placed: [],
      words: [{ text: 'AT', cells: [{ row: 7, col: 7 }, { row: 7, col: 8 }], score: 4 }],
      beats: [
        { kind: 'tile', word: 0, row: 7, col: 7, letter: 'A', value: 1, isNew: true, running: 1 },
        { kind: 'tile', word: 0, row: 7, col: 8, letter: 'T', value: 1, isNew: true, running: 2 },
        { kind: 'word_premium', word: 0, premium: 'DW', row: 7, col: 7, multiplier: 2, running: 4 },
        { kind: 'word', word: 0, text: 'AT', score: 4, running: 4 },
        { kind: 'total', total: 4, score: 4 },
      ],
      total: 4,
      bingo: false,
      exchanged: 0,
    };
    controller.onSnapshot(snapshot({ rack: RACK, turnNumber: 1, lastTurn, seats: snapshot().seats.map((s) => (s.seatId === '2' ? { ...s, score: 4 } : s)) }));
    expect(model.displayScore('2', 4)).toBe(0);
    expect(scheduled.map((s) => s.at)).toEqual([...scheduled.map((s) => s.at)].sort((a, b) => a - b));
    for (const step of scheduled) {
      step.fn();
    }
    expect(model.timelineLog).toEqual(['highlight AT', '+1', '+1', '2× word ×2', 'AT 4', '+4']);
    expect(model.displayScore('2', 4)).toBe(4);
  });

  it('does not replay the last turn already on the table when you join', () => {
    const model = new TableModel(1280, 900);
    const scheduled: unknown[] = [];
    const controller = new TableController(model, { seated: false } as SessionPort, { pickBlank: async () => null, toast: () => {} }, {
      schedule: (fn) => scheduled.push(fn),
    });
    controller.onSnapshot(snapshot({ turnNumber: 5, lastTurn: { kind: 'play', turnNumber: 5, beats: [], words: [] } as unknown as LastTurn }));
    expect(scheduled).toEqual([]);
  });

  it('explains rejected words and placements in plain language', () => {
    expect(describeError({ type: 'error', code: 'invalid_word', words: ['QZX'] })).toBe('QZX is not in the word list.');
    expect(describeError({ type: 'error', code: 'invalid_placement', reason: 'gap' })).toBe('A word cannot have gaps.');
    expect(describeError({ type: 'error', code: 'mystery' })).toBe('That move was not accepted.');
  });
});
