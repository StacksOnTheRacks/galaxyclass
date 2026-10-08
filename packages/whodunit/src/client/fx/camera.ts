import type { GameEvent } from '../../protocol.js';
import { CASE_FILE, ROOM_LAYOUT } from '../../rules/board.js';
import type { SuspectId, TokenPosition } from '../../rules/types.js';
import { BOARD_HEIGHT, BOARD_MARGIN, BOARD_WIDTH, rectUnits, tokenPoint, type Point } from '../geometry.js';
import { EASE_IN_OUT } from './animate.js';
import { phase, type EventSchedule } from './timeline.js';

/** A square window onto the board, in SVG units. */
export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The whole mansion and its frame: the camera's resting view and the SVG viewBox. */
export const FULL_VIEW: View = {
  x: -BOARD_MARGIN,
  y: -BOARD_MARGIN,
  w: BOARD_WIDTH + BOARD_MARGIN * 2,
  h: BOARD_HEIGHT + BOARD_MARGIN * 2,
};

/** Never zoom in further than this many units across (about nine squares). */
export const MIN_VIEW = 90;
const PAD = 14;

/** The smallest square view (at least MIN_VIEW across) that holds every point, kept inside the board. */
export function focusView(points: Point[], options: { pad?: number; min?: number } = {}): View {
  if (points.length === 0) {
    return FULL_VIEW;
  }
  const pad = options.pad ?? PAD;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;
  const size = Math.min(FULL_VIEW.w, Math.max(options.min ?? MIN_VIEW, maxX - minX, maxY - minY));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const clamp = (value: number, lo: number, span: number) => Math.min(Math.max(value, lo), lo + span - size);
  return { x: clamp(cx - size / 2, FULL_VIEW.x, FULL_VIEW.w), y: clamp(cy - size / 2, FULL_VIEW.y, FULL_VIEW.h), w: size, h: size };
}

/** The CSS transform (origin 0 0, in SVG units) that makes `view` fill the board's viewport. */
export function viewTransform(view: View): string {
  const scale = FULL_VIEW.w / view.w;
  const tx = FULL_VIEW.x - view.x * scale;
  const ty = FULL_VIEW.y - view.y * scale;
  return `translate(${round(tx)}px, ${round(ty)}px) scale(${round(scale)})`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export interface CameraPlan {
  focus: View;
  /** ms from the event start: easing in over [inStart, inEnd], holding, easing back over [outStart, total]. */
  inStart: number;
  inEnd: number;
  outStart: number;
  total: number;
}

export interface CameraContext {
  positions: Record<SuspectId, TokenPosition> | null;
  /** The suspect each seat plays. */
  suspectOf(seatId: string): SuspectId | null;
}

function rectPoints(rect: { x: number; y: number; w: number; h: number }): Point[] {
  const r = rectUnits(rect);
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
  ];
}

/**
 * Where the camera goes for an event: the roller's token for dice, the whole path for a walk, the
 * room for a suggestion, the case file for an accusation and the final reveal. Everything else
 * plays on the full board.
 */
export function cameraPlan(event: GameEvent, schedule: EventSchedule, context: CameraContext): CameraPlan | null {
  const total = schedule.total;
  if (total <= 0) {
    return null;
  }
  const shot = (focus: View, inEnd: number, outStart: number): CameraPlan => ({
    focus,
    inStart: 0,
    inEnd: Math.min(inEnd, outStart),
    outStart,
    total,
  });
  switch (event.kind) {
    case 'rolled': {
      const suspect = context.suspectOf(event.seatId);
      const position = suspect ? context.positions?.[suspect] : null;
      if (!suspect || !position) {
        return null;
      }
      return shot(focusView([tokenPoint(position, suspect)], { min: 110 }), total * 0.3, total * 0.78);
    }
    case 'moved': {
      if (event.via === 'passage') {
        return null;
      }
      const points = event.path.map((position) => tokenPoint(position, event.suspect));
      const lead = phase(schedule, 'lead');
      const settle = phase(schedule, 'settle');
      return shot(focusView(points, { min: 100 }), lead?.end ?? total * 0.2, settle?.start ?? total * 0.8);
    }
    case 'suggested':
      return shot(focusView(rectPoints(ROOM_LAYOUT[event.room].rect), { pad: 12 }), phase(schedule, 'fly')?.end ?? total * 0.2, total * 0.86);
    case 'accused':
      return shot(focusView(rectPoints(CASE_FILE), { pad: 22 }), total * 0.25, total * 0.84);
    case 'game_over':
      return shot(focusView(rectPoints(CASE_FILE), { pad: 22 }), total * 0.2, total * 0.88);
    default:
      return null;
  }
}

/**
 * Keyframes for the camera group over the whole event (fill none, so it rests on the full board
 * afterwards). Reduced motion cuts straight to the shot and straight back, with no easing.
 */
export function cameraKeyframes(plan: CameraPlan, reduced: boolean): { keyframes: Keyframe[]; duration: number } {
  const focus = viewTransform(plan.focus);
  const full = viewTransform(FULL_VIEW);
  if (reduced) {
    return { keyframes: [{ transform: focus }, { transform: focus }], duration: Math.max(1, plan.outStart) };
  }
  const at = (ms: number) => Math.min(1, Math.max(0, ms / plan.total));
  return {
    keyframes: [
      { transform: full, offset: 0, easing: EASE_IN_OUT },
      { transform: full, offset: at(plan.inStart), easing: EASE_IN_OUT },
      { transform: focus, offset: at(plan.inEnd) },
      { transform: focus, offset: at(plan.outStart), easing: EASE_IN_OUT },
      { transform: full, offset: 1 },
    ],
    duration: plan.total,
  };
}
