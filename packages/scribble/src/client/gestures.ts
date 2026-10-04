/**
 * One pointer state machine for the whole canvas. The scene hit-tests on pointer down and
 * passes the target in; the machine decides between tap, tile drag, pan, and pinch.
 */
export type GestureTarget =
  | { kind: 'rack'; tileId: string }
  | { kind: 'draft'; tileId: string }
  | { kind: 'board' }
  | { kind: 'none' };

interface Point {
  id: number;
  x: number;
  y: number;
}

export type GestureState =
  | { kind: 'idle' }
  | { kind: 'pressed'; pointer: Point; start: Point; target: GestureTarget }
  | { kind: 'dragging'; pointerId: number; tileId: string; from: 'rack' | 'draft' }
  | { kind: 'panning'; pointer: Point }
  | { kind: 'pinching'; a: Point; b: Point }
  | { kind: 'releasing'; pointerId: number };

export type GestureEvent =
  | { type: 'down'; id: number; x: number; y: number; target: GestureTarget }
  | { type: 'move'; id: number; x: number; y: number }
  | { type: 'up'; id: number; x: number; y: number }
  | { type: 'cancel' };

export type GestureEffect =
  | { type: 'tap'; target: GestureTarget; x: number; y: number }
  | { type: 'drag_start'; tileId: string; from: 'rack' | 'draft'; x: number; y: number }
  | { type: 'drag_move'; tileId: string; x: number; y: number }
  | { type: 'drop'; tileId: string; from: 'rack' | 'draft'; x: number; y: number }
  | { type: 'drag_cancel'; tileId: string; from: 'rack' | 'draft' }
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'pinch'; factor: number; x: number; y: number };

export const DRAG_THRESHOLD = 6;

export const IDLE: GestureState = { kind: 'idle' };

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

function result(state: GestureState, ...effects: GestureEffect[]) {
  return { state, effects };
}

export function stepGesture(
  state: GestureState,
  event: GestureEvent,
): { state: GestureState; effects: GestureEffect[] } {
  if (event.type === 'cancel') {
    return state.kind === 'dragging'
      ? result(IDLE, { type: 'drag_cancel', tileId: state.tileId, from: state.from })
      : result(IDLE);
  }

  switch (state.kind) {
    case 'idle':
      if (event.type === 'down') {
        const point = { id: event.id, x: event.x, y: event.y };
        return result({ kind: 'pressed', pointer: point, start: point, target: event.target });
      }
      return result(state);

    case 'pressed': {
      if (event.type === 'down' && event.id !== state.pointer.id) {
        if (state.target.kind === 'board' || event.target.kind === 'board' || event.target.kind === 'draft') {
          return result({ kind: 'pinching', a: state.pointer, b: { id: event.id, x: event.x, y: event.y } });
        }
        return result(state);
      }
      if (event.id !== state.pointer.id) {
        return result(state);
      }
      if (event.type === 'up') {
        return result(IDLE, { type: 'tap', target: state.target, x: event.x, y: event.y });
      }
      if (event.type === 'move') {
        const point = { id: event.id, x: event.x, y: event.y };
        if (distance(point, state.start) < DRAG_THRESHOLD) {
          return result({ ...state, pointer: point });
        }
        const { target } = state;
        if (target.kind === 'rack' || target.kind === 'draft') {
          return result(
            { kind: 'dragging', pointerId: event.id, tileId: target.tileId, from: target.kind },
            { type: 'drag_start', tileId: target.tileId, from: target.kind, x: event.x, y: event.y },
            { type: 'drag_move', tileId: target.tileId, x: event.x, y: event.y },
          );
        }
        if (target.kind === 'board') {
          return result(
            { kind: 'panning', pointer: point },
            { type: 'pan', dx: point.x - state.start.x, dy: point.y - state.start.y },
          );
        }
        return result({ ...state, pointer: point });
      }
      return result(state);
    }

    case 'dragging':
      if (event.type === 'down' || event.id !== state.pointerId) {
        return result(state);
      }
      if (event.type === 'move') {
        return result(state, { type: 'drag_move', tileId: state.tileId, x: event.x, y: event.y });
      }
      return result(IDLE, { type: 'drop', tileId: state.tileId, from: state.from, x: event.x, y: event.y });

    case 'panning':
      if (event.type === 'down' && event.id !== state.pointer.id) {
        return result({ kind: 'pinching', a: state.pointer, b: { id: event.id, x: event.x, y: event.y } });
      }
      if (event.id !== state.pointer.id) {
        return result(state);
      }
      if (event.type === 'move') {
        const point = { id: event.id, x: event.x, y: event.y };
        return result({ kind: 'panning', pointer: point }, { type: 'pan', dx: point.x - state.pointer.x, dy: point.y - state.pointer.y });
      }
      return result(IDLE);

    case 'pinching': {
      const isA = event.id === state.a.id;
      const isB = event.id === state.b.id;
      if (!isA && !isB) {
        return result(state);
      }
      if (event.type === 'up') {
        return result({ kind: 'releasing', pointerId: isA ? state.b.id : state.a.id });
      }
      if (event.type !== 'move') {
        return result(state);
      }
      const moved = { id: event.id, x: event.x, y: event.y };
      const a = isA ? moved : state.a;
      const b = isB ? moved : state.b;
      const before = distance(state.a, state.b);
      const after = distance(a, b);
      const factor = before > 0 ? after / before : 1;
      return result(
        { kind: 'pinching', a, b },
        { type: 'pinch', factor, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      );
    }

    case 'releasing':
      if (event.type === 'up' && event.id === state.pointerId) {
        return result(IDLE);
      }
      return result(state);
  }
}
