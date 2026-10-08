import type { GameEvent, GameEventKind } from '../../protocol.js';

/**
 * Every event's animation as pure numbers (ms from when the event starts: `serverTs + delayMs`).
 * Every detective builds the same schedule from the same event, then seeks it to
 * `serverNow − serverTs − delayMs`, so a late arrival joins mid-walk and every board lands the
 * token on the same square at the same instant. The server may retime an event; the phases
 * stretch to fit, keeping their ratios.
 */

export type PhaseName =
  | 'deal'
  | 'tumble'
  | 'settle'
  | 'lead'
  | 'walk'
  | 'vanish'
  | 'appear'
  | 'fly'
  | 'pull'
  | 'ask'
  | 'reveal'
  | 'drumroll'
  | 'verdict'
  | 'handoff'
  | 'cut';

export interface Phase {
  name: PhaseName;
  start: number;
  end: number;
}

export interface EventSchedule {
  kind: GameEventKind;
  reduced: boolean;
  phases: Phase[];
  /** When the event's result is folded into what the board and panel show. */
  resolveAt: number;
  /** The whole animation; the next event (or the open turn) follows. */
  total: number;
}

/** Reduced motion: cut straight to the result after this long; the turn still waits for the full span. */
export const REDUCED_RESOLVE_MS = 400;
export const REDUCED_FADE_MS = 120;

/** Base ratios for a walk: the camera eases in, the token steps, then settles. */
const WALK_LEAD = 450;
const WALK_STEP = 170;
const WALK_SETTLE = 450;

/** Fractions of the whole animation, per kind; `resolve` is where the result lands. */
const SPLITS: Record<Exclude<GameEventKind, 'moved'>, { phases: Array<[PhaseName, number, number]>; resolve: number }> = {
  game_started: { phases: [['deal', 0, 1]], resolve: 0.5 },
  rolled: {
    phases: [
      ['tumble', 0, 0.72],
      ['settle', 0.72, 1],
    ],
    resolve: 0.72,
  },
  suggested: {
    phases: [
      ['fly', 0, 0.2],
      ['pull', 0.2, 0.55],
      ['ask', 0.55, 1],
    ],
    resolve: 0.55,
  },
  refuted: { phases: [['reveal', 0, 1]], resolve: 0.45 },
  accused: {
    phases: [
      ['drumroll', 0, 0.55],
      ['verdict', 0.55, 1],
    ],
    resolve: 0.55,
  },
  turn_passed: { phases: [['handoff', 0, 1]], resolve: 0.5 },
  departed: { phases: [['reveal', 0, 1]], resolve: 0.5 },
  game_over: { phases: [['reveal', 0, 1]], resolve: 0.3 },
};

function scaled(total: number, phases: Array<[PhaseName, number, number]>): Phase[] {
  return phases.map(([name, from, to]) => ({ name, start: from * total, end: to * total }));
}

export function eventSchedule(event: GameEvent, options: { reduced: boolean }): EventSchedule {
  const total = Math.max(0, event.animationMs);
  if (options.reduced) {
    const resolveAt = Math.min(REDUCED_RESOLVE_MS, total);
    return { kind: event.kind, reduced: true, phases: [{ name: 'cut', start: 0, end: resolveAt }], resolveAt, total };
  }
  if (event.kind === 'moved') {
    if (event.via === 'passage') {
      const phases = scaled(total, [
        ['vanish', 0, 0.45],
        ['appear', 0.45, 1],
      ]);
      return { kind: event.kind, reduced: false, phases, resolveAt: 0.45 * total, total };
    }
    const steps = Math.max(1, event.path.length - 1);
    const base = WALK_LEAD + steps * WALK_STEP + WALK_SETTLE;
    const lead = (WALK_LEAD / base) * total;
    const walkEnd = lead + ((steps * WALK_STEP) / base) * total;
    const phases: Phase[] = [
      { name: 'lead', start: 0, end: lead },
      { name: 'walk', start: lead, end: walkEnd },
      { name: 'settle', start: walkEnd, end: total },
    ];
    return { kind: event.kind, reduced: false, phases, resolveAt: walkEnd, total };
  }
  const split = SPLITS[event.kind];
  return { kind: event.kind, reduced: false, phases: scaled(total, split.phases), resolveAt: split.resolve * total, total };
}

export function phase(schedule: EventSchedule, name: PhaseName): Phase | null {
  return schedule.phases.find((p) => p.name === name) ?? null;
}

export type PhaseState = 'past' | 'active' | 'future';

/** Where each phase stands at `elapsed`, and how far into it (ms) when active. */
export function seek(schedule: EventSchedule, elapsed: number): Array<{ phase: Phase; state: PhaseState; into: number }> {
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
export function isResolved(schedule: EventSchedule, elapsed: number): boolean {
  return elapsed >= schedule.total;
}

/** When the walking token lands on each square of a path of `steps` squares (ms from the event start). */
export function stepTimes(schedule: EventSchedule, steps: number): number[] {
  const walk = phase(schedule, 'walk');
  if (!walk || steps <= 0) {
    return Array.from({ length: Math.max(0, steps) }, () => schedule.resolveAt);
  }
  const span = (walk.end - walk.start) / steps;
  return Array.from({ length: steps }, (_, i) => walk.start + (i + 1) * span);
}

/**
 * While a suggestion is being asked around the table: one beat per detective who could not refute,
 * then the one who can (or the gasp when nobody can).
 */
export function askCues(schedule: EventSchedule, passed: number): { passes: number[]; verdict: number } {
  const ask = phase(schedule, 'ask');
  if (!ask) {
    return { passes: Array.from({ length: passed }, () => schedule.resolveAt), verdict: schedule.resolveAt };
  }
  const beat = (ask.end - ask.start) / (passed + 1.5);
  return {
    passes: Array.from({ length: passed }, (_, i) => ask.start + (i + 0.5) * beat),
    verdict: ask.start + (passed + 0.5) * beat,
  };
}

/** Drops cues already behind `elapsed`, for a detective who joined mid-event. */
export function pendingCues(cues: number[], elapsed: number): number[] {
  return cues.filter((at) => at >= elapsed);
}
