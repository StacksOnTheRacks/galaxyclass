import type { ShotEvent } from '../../protocol.js';
import { BOARD_SIZE } from '../../rules/constants.js';
import { EASE_IN_OUT, EASE_OUT, seeded, svg, type ShotClock } from './animate.js';
import { hitBurst, missSplash, sinkOutline } from './impact.js';
import {
  BOARD_CENTER,
  beamAngle,
  cellCenter,
  phase,
  pingRingSpan,
  sweepCues,
  trackCues,
  VIEW_SIZE,
  type MarkerCue,
  type ShotSchedule,
} from './timeline.js';

/** What a board exposes to the shot effects: its SVG overlay and its coordinate markers. */
export interface BoardFxSurface {
  /** `viewBox="0 0 11 11"`: one unit per cell, cells start at (1, 1). */
  fx: SVGSVGElement;
  rowMarkers: HTMLElement[];
  colMarkers: HTMLElement[];
}

export type FxTone = 'outgoing' | 'incoming';

const SWEEP_RADIUS = 8.6;
const SWEEP_SLICES = 9;
const SLICE_DEGREES = 4.5;
const MARKER_FLASH_MS = 180;
const BLIPS = 5;

function polar(degrees: number, radius: number): string {
  const radians = (degrees * Math.PI) / 180;
  return `${(BOARD_CENTER + radius * Math.sin(radians)).toFixed(3)} ${(BOARD_CENTER - radius * Math.cos(radians)).toFixed(3)}`;
}

function sector(from: number, to: number, radius: number): string {
  return `M ${BOARD_CENTER} ${BOARD_CENTER} L ${polar(from, radius)} A ${radius} ${radius} 0 0 1 ${polar(to, radius)} Z`;
}

function glowOf(marker: HTMLElement | undefined): HTMLElement | null {
  return marker?.querySelector<HTMLElement>('.ws-marker-glow') ?? null;
}

function markerFor(surface: BoardFxSurface, cue: Pick<MarkerCue, 'axis' | 'index'>): HTMLElement | undefined {
  return cue.axis === 'row' ? surface.rowMarkers[cue.index] : surface.colMarkers[cue.index];
}

function flashMarker(clock: ShotClock, surface: BoardFxSurface, cue: MarkerCue, peak: number, duration = MARKER_FLASH_MS): void {
  const glow = glowOf(markerFor(surface, cue));
  if (glow) {
    clock.at(glow, [{ opacity: 0 }, { opacity: peak, offset: 0.3 }, { opacity: 0 }], { start: cue.at, duration, fill: 'none' });
  }
}

function holdMarker(clock: ShotClock, surface: BoardFxSurface, axis: 'row' | 'col', index: number, from: number, until: number): void {
  const glow = glowOf(markerFor(surface, { axis, index }));
  if (glow && until > from) {
    clock.at(
      glow,
      [{ opacity: 0 }, { opacity: 1, offset: Math.min(0.2, 120 / (until - from)) }, { opacity: 1, offset: 0.85 }, { opacity: 0 }],
      { start: from, duration: until - from, fill: 'none' },
    );
  }
}

function reticle(at: { x: number; y: number }): { outer: SVGGElement; inner: SVGGElement } {
  const s = 0.5;
  const arm = 0.22;
  const corner = (dx: number, dy: number) =>
    svg('path', { d: `M ${dx * s} ${dy * (s - arm)} V ${dy * s} H ${dx * (s - arm)}`, class: 'ws-fx-reticle-arm' });
  const inner = svg(
    'g',
    { class: 'ws-fx-reticle' },
    corner(-1, -1),
    corner(1, -1),
    corner(-1, 1),
    corner(1, 1),
    svg('path', { d: `M -0.14 0 H 0.14 M 0 -0.14 V 0.14`, class: 'ws-fx-reticle-cross' }),
  );
  const outer = svg('g', { transform: `translate(${at.x} ${at.y})` }, inner);
  return { outer, inner };
}

function sweep(group: SVGGElement, clock: ShotClock, schedule: ShotSchedule, surface: BoardFxSurface, shot: ShotEvent): void {
  const span = phase(schedule, 'sweep');
  if (!span) {
    return;
  }
  const rotor = svg('g', { class: 'ws-fx-rotor' });
  for (let i = SWEEP_SLICES - 1; i >= 0; i--) {
    const opacity = 0.42 * (1 - i / SWEEP_SLICES) ** 2;
    rotor.append(svg('path', { d: sector(-(i + 1) * SLICE_DEGREES, -i * SLICE_DEGREES, SWEEP_RADIUS), class: 'ws-fx-wedge', 'fill-opacity': opacity.toFixed(3) }));
  }
  rotor.append(svg('line', { x1: BOARD_CENTER, y1: BOARD_CENTER, x2: BOARD_CENTER, y2: BOARD_CENTER - SWEEP_RADIUS, class: 'ws-fx-beam' }));
  const sweepGroup = svg('g', { class: 'ws-fx-sweep', opacity: 0 }, rotor);
  group.append(sweepGroup);

  const duration = span.end - span.start;
  clock.at(rotor, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { start: span.start, duration });
  clock.at(sweepGroup, [{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], {
    start: span.start,
    duration,
  });

  for (const cue of sweepCues(schedule)) {
    flashMarker(clock, surface, cue, 0.85);
  }

  // Faint contacts that light as the beam passes and fade behind it; the same for both captains.
  const random = seeded(shot.shotId);
  for (let i = 0; i < BLIPS; i++) {
    const at = cellCenter({ row: Math.floor(random() * BOARD_SIZE), col: Math.floor(random() * BOARD_SIZE) });
    const blip = svg('circle', { cx: at.x, cy: at.y, r: 0.12, class: 'ws-fx-blip', opacity: 0 });
    group.append(blip);
    clock.at(blip, [{ opacity: 0 }, { opacity: 0.8, offset: 0.15 }, { opacity: 0 }], {
      start: span.start + (beamAngle(at) / 360) * duration,
      duration: 520,
    });
  }
}

function track(group: SVGGElement, clock: ShotClock, schedule: ShotSchedule, surface: BoardFxSurface, shot: ShotEvent): number {
  const span = phase(schedule, 'track');
  const resolve = phase(schedule, 'resolve');
  if (!span || !resolve) {
    return 0;
  }
  const { step, cues } = trackCues(schedule, shot.coord);
  const target = cellCenter(shot.coord);
  const meetAt = span.start + Math.max(shot.coord.row, shot.coord.col) * step;

  const hLine = svg('line', { x1: 1, x2: VIEW_SIZE, y1: 0, y2: 0, class: 'ws-fx-scan' });
  const vLine = svg('line', { x1: 0, x2: 0, y1: 1, y2: VIEW_SIZE, class: 'ws-fx-scan' });
  const lines = svg('g', { class: 'ws-fx-scanlines', opacity: 0 }, hLine, vLine);
  group.append(lines);

  const glide = (axis: 'x' | 'y', steps: number, line: SVGLineElement) => {
    const frames: Keyframe[] = [];
    for (let i = 0; i < steps; i++) {
      const value = 1.5 + i;
      frames.push({ transform: axis === 'y' ? `translate(0px, ${value}px)` : `translate(${value}px, 0px)`, easing: EASE_OUT });
    }
    if (frames.length === 1) {
      frames.push({ ...frames[0]! });
    }
    clock.at(line, frames, { start: span.start, duration: Math.max(1, (steps - 1) * step) });
  };
  glide('y', shot.coord.row + 1, hLine);
  glide('x', shot.coord.col + 1, vLine);
  clock.at(lines, [{ opacity: 0 }, { opacity: 1, offset: 0.06 }, { opacity: 1, offset: 0.88 }, { opacity: 0 }], {
    start: span.start,
    duration: resolve.end - span.start,
  });

  for (const cue of cues) {
    const last = cue.axis === 'row' ? cue.index === shot.coord.row : cue.index === shot.coord.col;
    if (last) {
      holdMarker(clock, surface, cue.axis, cue.index, cue.at, resolve.end);
    } else {
      flashMarker(clock, surface, cue, 1, Math.max(MARKER_FLASH_MS, step * 1.6));
    }
  }

  // The ping: rings expand from the target as the result comes back.
  const ringSpan = pingRingSpan(schedule);
  for (let i = 0; i < 2; i++) {
    const ring = svg('circle', { cx: target.x, cy: target.y, r: 1.5, class: 'ws-fx-ping', opacity: 0 });
    group.append(ring);
    const start = span.end - ringSpan + i * 90;
    clock.at(
      ring,
      [
        { transform: 'scale(0.05)', opacity: 1 },
        { transform: 'scale(1)', opacity: 0 },
      ],
      { start, duration: Math.max(1, ringSpan - i * 60), easing: EASE_OUT },
    );
  }
  return meetAt;
}

/**
 * One shot on one board: lock-in reticle, the 360° sonar sweep that flashes each coordinate
 * marker as the beam passes, the tracking scan that ticks down the markers to the target, the
 * ping, then the hit or miss and (when it sank something) the hull outline. The shooter plays it
 * on the target board, the defender on their own board in the incoming palette, on one clock.
 */
export function playShotFx(surface: BoardFxSurface, shot: ShotEvent, schedule: ShotSchedule, clock: ShotClock, tone: FxTone): () => void {
  const group = svg('g', { class: 'ws-fx-shot', 'data-tone': tone });
  surface.fx.append(group);
  const target = cellCenter(shot.coord);
  const resolve = phase(schedule, 'resolve')!;
  const lock = phase(schedule, 'lock')!;

  if (schedule.reduced) {
    const glowCell = svg('rect', {
      x: target.x - 0.5,
      y: target.y - 0.5,
      width: 1,
      height: 1,
      class: 'ws-fx-highlight',
      opacity: 0,
    });
    group.append(glowCell);
    clock.at(glowCell, [{ opacity: 0 }, { opacity: 0.55, offset: 0.05 }, { opacity: 0.55, offset: 0.9 }, { opacity: 0 }], {
      start: 0,
      duration: schedule.total,
    });
    holdMarker(clock, surface, 'row', shot.coord.row, 0, schedule.total);
    holdMarker(clock, surface, 'col', shot.coord.col, 0, schedule.total);
  } else {
    sweep(group, clock, schedule, surface, shot);
    const meetAt = track(group, clock, schedule, surface, shot);
    const { outer, inner } = reticle(target);
    group.append(outer);
    clock.at(inner, [{ transform: 'scale(1.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], {
      start: 0,
      duration: Math.max(1, lock.end),
      easing: EASE_OUT,
      fill: 'backwards',
    });
    clock.at(
      outer,
      [{ opacity: 1 }, { opacity: 1, offset: 0.92 }, { opacity: 0 }],
      { start: 0, duration: resolve.end, fill: 'forwards' },
    );
    if (meetAt > 0) {
      clock.at(inner, [{ transform: 'scale(1)' }, { transform: 'scale(0.82)' }, { transform: 'scale(1)' }], {
        start: meetAt,
        duration: 220,
        easing: EASE_IN_OUT,
        fill: 'none',
      });
    }
  }

  const random = seeded(`${shot.shotId}:impact`);
  if (shot.result === 'hit') {
    hitBurst(group, clock, { at: target, start: schedule.resolveAt, span: resolve.end - resolve.start, reduced: schedule.reduced, random });
  } else {
    missSplash(group, clock, { at: target, start: schedule.resolveAt, span: resolve.end - resolve.start, reduced: schedule.reduced, random });
  }
  if (shot.sunkShip && schedule.sinkAt !== null) {
    sinkOutline(group, clock, { ship: shot.sunkShip, start: schedule.sinkAt, end: schedule.total, reduced: schedule.reduced });
  }

  return () => {
    group.remove();
  };
}
