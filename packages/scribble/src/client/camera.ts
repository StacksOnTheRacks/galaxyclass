import { BOARD_PX, type Rect } from './layout.js';

/**
 * Board camera with its origin at the viewport's top-left: a world point maps to
 * `viewport + (world - scroll) * zoom`. Zoom 1 here means "board fits the viewport";
 * `zoom` is the real scale applied to world units.
 */
export interface CameraState {
  zoom: number;
  scrollX: number;
  scrollY: number;
}

export const MAX_ZOOM_FACTOR = 3;

export function fitZoom(viewport: Rect): number {
  return Math.min(viewport.width / BOARD_PX, viewport.height / BOARD_PX);
}

export function zoomBounds(viewport: Rect): { min: number; max: number } {
  const min = fitZoom(viewport);
  return { min, max: min * MAX_ZOOM_FACTOR };
}

function clampAxis(scroll: number, visible: number): number {
  if (visible >= BOARD_PX) {
    return (BOARD_PX - visible) / 2;
  }
  return Math.min(Math.max(scroll, 0), BOARD_PX - visible);
}

/** Keeps the board on screen: centred along an axis that fits, clamped to its edges otherwise. */
export function clampCamera(state: CameraState, viewport: Rect): CameraState {
  const { min, max } = zoomBounds(viewport);
  const zoom = Math.min(Math.max(state.zoom, min), max);
  return {
    zoom,
    scrollX: clampAxis(state.scrollX, viewport.width / zoom),
    scrollY: clampAxis(state.scrollY, viewport.height / zoom),
  };
}

export function fitCamera(viewport: Rect): CameraState {
  return clampCamera({ zoom: fitZoom(viewport), scrollX: 0, scrollY: 0 }, viewport);
}

export function screenToWorld(state: CameraState, viewport: Rect, x: number, y: number): { x: number; y: number } {
  return { x: state.scrollX + (x - viewport.x) / state.zoom, y: state.scrollY + (y - viewport.y) / state.zoom };
}

export function worldToScreen(state: CameraState, viewport: Rect, x: number, y: number): { x: number; y: number } {
  return { x: viewport.x + (x - state.scrollX) * state.zoom, y: viewport.y + (y - state.scrollY) * state.zoom };
}

/** Zooms by `factor`, keeping the world point under the screen anchor fixed. */
export function zoomAt(state: CameraState, viewport: Rect, factor: number, anchorX: number, anchorY: number): CameraState {
  const { min, max } = zoomBounds(viewport);
  const zoom = Math.min(Math.max(state.zoom * factor, min), max);
  const world = screenToWorld(state, viewport, anchorX, anchorY);
  return clampCamera(
    {
      zoom,
      scrollX: world.x - (anchorX - viewport.x) / zoom,
      scrollY: world.y - (anchorY - viewport.y) / zoom,
    },
    viewport,
  );
}

/** Pans by a screen-space drag delta. */
export function panBy(state: CameraState, viewport: Rect, dx: number, dy: number): CameraState {
  return clampCamera({ ...state, scrollX: state.scrollX - dx / state.zoom, scrollY: state.scrollY - dy / state.zoom }, viewport);
}

export function isZoomedIn(state: CameraState, viewport: Rect): boolean {
  return state.zoom > fitZoom(viewport) * 1.001;
}

/** Wheel delta to a zoom factor; trackpad pinches arrive as small ctrl+wheel deltas. */
export function wheelFactor(deltaY: number): number {
  return Math.exp(-Math.max(-200, Math.min(200, deltaY)) * 0.0025);
}

/** After a resize, keep the same relative zoom and the same world point at the viewport centre. */
export function resizeCamera(state: CameraState, from: Rect, to: Rect): CameraState {
  const relative = state.zoom / fitZoom(from);
  const centre = screenToWorld(state, from, from.x + from.width / 2, from.y + from.height / 2);
  const zoom = fitZoom(to) * relative;
  return clampCamera(
    { zoom, scrollX: centre.x - to.width / 2 / zoom, scrollY: centre.y - to.height / 2 / zoom },
    to,
  );
}
