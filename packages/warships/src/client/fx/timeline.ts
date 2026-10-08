import {
  BOARD_SIZE,
  SHOT_ANIMATION_MS,
  SHOT_LOCK_IN_MS,
  SHOT_RESOLVE_MS,
  SINK_ANNOUNCE_MS,
  SONAR_SWEEP_MS,
  SONAR_TRACK_MS,
} from '../../rules/constants.js';
import type { Coord } from '../../rules/types.js';

/**
 * The shot timeline as pure numbers (ms from the shot's `serverTs`). Both captains build the same
 * schedule from the same `animationMs`, then seek it to `serverNow − serverTs`, so a late arrival
 * joins mid-sweep and both boards resolve at the same instant.
 */

export type PhaseName = 'lock' | 'sweep' | 'track' | 'resolve' | 'sink';

export interface Phase {
  name: PhaseName;
  start: number;
  end: number;
}

export interface ShotSchedule {
  reduced: boolean;
  phases: Phase[];
  /** When the hit or miss mark appears. */
  resolveAt: number;
  /** When the sunk ship is announced; null when nothing sank. */
  sinkAt: number | null;
  /** The whole animation; the turn hand-over happens here. */
  total: number;
}

/** Reduced motion: highlight at once, show the mark after this long. */
export const REDUCED_RESOLVE_MS = 400;
export const REDUCED_FADE_MS = 120;
/** The expanding ping ring closes out the track phase. */
export const PING_RING_MS = 300;

export function shotSchedule(options: { animationMs: number; sunk: boolean; reduced: boolean }): ShotSchedule {
  const total = Math.max(0, options.animationMs);
  const sinkBudget = options.sunk ? Math.min(SINK_ANNOUNCE_MS, total) : 0;
  const shotBudget = Math.max(0, total - sinkBudget);

  if (options.reduced) {
    const resolveAt = Math.min(REDUCED_RESOLVE_MS, shotBudget);
    const phases: Phase[] = [
      { name: 'lock', start: 0, end: Math.min(REDUCED_FADE_MS, resolveAt) },
      { name: 'resolve', start: resolveAt, end: shotBudget },
    ];
    if (options.sunk) {
      phases.push({ name: 'sink', start: shotBudget, end: total });
    }
    return { reduced: true, phases, resolveAt, sinkAt: options.sunk ? shotBudget : null, total };
  }

  // The server may retime a shot; stretch the four base phases to fit, keeping their ratios.
  const scale = SHOT_ANIMATION_MS > 0 ? shotBudget / SHOT_ANIMATION_MS : 0;
  const lockEnd = SHOT_LOCK_IN_MS * scale;
  const sweepEnd = lockEnd + SONAR_SWEEP_MS * scale;
  const trackEnd = sweepEnd + SONAR_TRACK_MS * scale;
  const resolveEnd = trackEnd + SHOT_RESOLVE_MS * scale;
  const phases: Phase[] = [
    { name: 'lock', start: 0, end: lockEnd },
    { name: 'sweep', start: lockEnd, end: sweepEnd },
    { name: 'track', start: sweepEnd, end: trackEnd },
    { name: 'resolve', start: trackEnd, end: resolveEnd },
  ];
  if (options.sunk) {
    phases.push({ name: 'sink', start: resolveEnd, end: total });
  }
  return { reduced: false, phases, resolveAt: trackEnd, sinkAt: options.sunk ? resolveEnd : null, total };
}

export function phase(schedule: ShotSchedule, name: PhaseName): Phase | null {
  return schedule.phases.find((p) => p.name === name) ?? null;
}

export type PhaseState = 'past' | 'active' | 'future';

/** Where each phase stands at `elapsed`, and how far into it (ms) when active. */
export function seek(schedule: ShotSchedule, elapsed: number): Array<{ phase: Phase; state: PhaseState; into: number }> {
  return schedule.phases.map((p) => {
    if (elapsed >= p.end) {
      return { phase: p, state: 'past', into: p.end - p.start };
    }
    if (elapsed < p.start) {
      return { phase: p, state: 'future', into: 0 };
    }
    return { phase: p, state: 'active', into: elapsed - p.start };
  });
}

/** Nothing left to animate: show the final state instantly. */
export function isResolved(schedule: ShotSchedule, elapsed: number): boolean {
  return elapsed >= schedule.total;
}

/** Board-local units: the 10×10 cells sit at 1..11 after a one-cell marker gutter. */
export const GUTTER = 1;
export const VIEW_SIZE = BOARD_SIZE + GUTTER;
export const BOARD_CENTER = GUTTER + BOARD_SIZE / 2;

export function cellCenter(coord: Coord): { x: number; y: number } {
  return { x: GUTTER + coord.col + 0.5, y: GUTTER + coord.row + 0.5 };
}

export function rowMarkerCenter(row: number): { x: number; y: number } {
  return { x: GUTTER / 2, y: GUTTER + row + 0.5 };
}

export function colMarkerCenter(col: number): { x: number; y: number } {
  return { x: GUTTER + col + 0.5, y: GUTTER / 2 };
}

/** Degrees clockwise from 12 o'clock around the board centre, in [0, 360). */
export function beamAngle(point: { x: number; y: number }): number {
  const dx = point.x - BOARD_CENTER;
  const dy = point.y - BOARD_CENTER;
  const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

export interface MarkerCue {
  axis: 'row' | 'col';
  index: number;
  /** ms from the shot's start. */
  at: number;
}

/** As the beam passes each coordinate marker, it flashes. */
export function sweepCues(schedule: ShotSchedule): MarkerCue[] {
  const sweep = phase(schedule, 'sweep');
  if (!sweep) {
    return [];
  }
  const span = sweep.end - sweep.start;
  const cues: MarkerCue[] = [];
  for (let index = 0; index < BOARD_SIZE; index++) {
    cues.push({ axis: 'row', index, at: sweep.start + (beamAngle(rowMarkerCenter(index)) / 360) * span });
    cues.push({ axis: 'col', index, at: sweep.start + (beamAngle(colMarkerCenter(index)) / 360) * span });
  }
  return cues.sort((a, b) => a.at - b.at);
}

/**
 * The tracking scan: one line steps down the row markers from A to the target row while another
 * steps across the column markers from 1 to the target column, one tick per marker.
 */
export function trackCues(schedule: ShotSchedule, target: Coord): { step: number; cues: MarkerCue[] } {
  const track = phase(schedule, 'track');
  if (!track) {
    return { step: 0, cues: [] };
  }
  const rowSteps = target.row + 1;
  const colSteps = target.col + 1;
  const step = (track.end - track.start - pingRingSpan(schedule)) / Math.max(rowSteps, colSteps, 1);
  const cues: MarkerCue[] = [];
  for (let index = 0; index < rowSteps; index++) {
    cues.push({ axis: 'row', index, at: track.start + index * step });
  }
  for (let index = 0; index < colSteps; index++) {
    cues.push({ axis: 'col', index, at: track.start + index * step });
  }
  return { step, cues: cues.sort((a, b) => a.at - b.at || (a.axis === 'row' ? -1 : 1)) };
}

/** The ping ring ends exactly when the result lands. */
export function pingRingSpan(schedule: ShotSchedule): number {
  const track = phase(schedule, 'track');
  if (!track) {
    return 0;
  }
  const span = track.end - track.start;
  return Math.min(span, (PING_RING_MS * span) / SONAR_TRACK_MS);
}

/** Drops cues already behind `elapsed`, for a captain who joined mid-shot. */
export function pendingCues(cues: MarkerCue[], elapsed: number): MarkerCue[] {
  return cues.filter((cue) => cue.at >= elapsed);
}
