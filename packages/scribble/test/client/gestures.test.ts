import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD, IDLE, stepGesture, type GestureEffect, type GestureEvent, type GestureState } from '../../src/client/gestures.js';

function run(events: GestureEvent[], start: GestureState = IDLE) {
  let state = start;
  const effects: GestureEffect[] = [];
  for (const event of events) {
    const next = stepGesture(state, event);
    state = next.state;
    effects.push(...next.effects);
  }
  return { state, effects };
}

const rack = { kind: 'rack', tileId: 't1' } as const;
const board = { kind: 'board' } as const;

describe('canvas gestures', () => {
  it('treats a press and release without movement as a tap', () => {
    const { state, effects } = run([
      { type: 'down', id: 1, x: 10, y: 10, target: rack },
      { type: 'move', id: 1, x: 12, y: 11 },
      { type: 'up', id: 1, x: 12, y: 11 },
    ]);
    expect(state).toEqual(IDLE);
    expect(effects).toEqual([{ type: 'tap', target: rack, x: 12, y: 11 }]);
  });

  it('starts a tile drag past the threshold, follows the pointer, and drops where released', () => {
    const { effects } = run([
      { type: 'down', id: 1, x: 10, y: 10, target: rack },
      { type: 'move', id: 1, x: 10 + DRAG_THRESHOLD + 1, y: 10 },
      { type: 'move', id: 1, x: 200, y: 150 },
      { type: 'up', id: 1, x: 210, y: 160 },
    ]);
    expect(effects.map((e) => e.type)).toEqual(['drag_start', 'drag_move', 'drag_move', 'drop']);
    expect(effects.at(-1)).toEqual({ type: 'drop', tileId: 't1', from: 'rack', x: 210, y: 160 });
  });

  it('picks a draft tile back up off the board by dragging it', () => {
    const { effects } = run([
      { type: 'down', id: 1, x: 300, y: 300, target: { kind: 'draft', tileId: 'd1' } },
      { type: 'move', id: 1, x: 300, y: 340 },
    ]);
    expect(effects[0]).toEqual({ type: 'drag_start', tileId: 'd1', from: 'draft', x: 300, y: 340 });
  });

  it('pans the board when dragging empty squares, by each move delta', () => {
    const { effects } = run([
      { type: 'down', id: 1, x: 100, y: 100, target: board },
      { type: 'move', id: 1, x: 120, y: 100 },
      { type: 'move', id: 1, x: 130, y: 90 },
      { type: 'up', id: 1, x: 130, y: 90 },
    ]);
    expect(effects).toEqual([
      { type: 'pan', dx: 20, dy: 0 },
      { type: 'pan', dx: 10, dy: -10 },
    ]);
  });

  it('pinches with two pointers on the board and zooms by the distance ratio about the midpoint', () => {
    const { state, effects } = run([
      { type: 'down', id: 1, x: 100, y: 100, target: board },
      { type: 'down', id: 2, x: 200, y: 100, target: board },
      { type: 'move', id: 2, x: 300, y: 100 },
    ]);
    expect(state.kind).toBe('pinching');
    expect(effects).toEqual([{ type: 'pinch', factor: 2, x: 200, y: 100 }]);
    const lifted = run([{ type: 'up', id: 1, x: 100, y: 100 }, { type: 'move', id: 2, x: 0, y: 0 }], state);
    expect(lifted.effects).toEqual([]);
    expect(run([{ type: 'up', id: 2, x: 0, y: 0 }], lifted.state).state).toEqual(IDLE);
  });

  it('ignores a second finger while a tile is being dragged, and cancels the drag on cancel', () => {
    const dragging = run([
      { type: 'down', id: 1, x: 10, y: 10, target: rack },
      { type: 'move', id: 1, x: 60, y: 10 },
      { type: 'down', id: 2, x: 400, y: 400, target: board },
    ]);
    expect(dragging.state.kind).toBe('dragging');
    expect(run([{ type: 'cancel' }], dragging.state).effects).toEqual([{ type: 'drag_cancel', tileId: 't1', from: 'rack' }]);
  });
});
