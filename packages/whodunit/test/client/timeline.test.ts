import { describe, expect, it } from 'vitest';
import {
  askCues,
  eventSchedule,
  isResolved,
  pendingCues,
  phase,
  REDUCED_RESOLVE_MS,
  seek,
  stepTimes,
} from '../../src/client/fx/timeline.js';
import { eventMessage } from './support.js';

const walk = (steps: number, animationMs: number) =>
  eventMessage({
    kind: 'moved',
    seatId: '1',
    suspect: 'vesper',
    via: 'walk',
    path: Array.from({ length: steps + 1 }, (_, i) => ({ kind: 'hall' as const, x: 7, y: i })),
    animationMs,
  }).event;

describe('event timeline', () => {
  it('tumbles the dice, then settles; the result lands at the settle', () => {
    const schedule = eventSchedule(eventMessage({ kind: 'rolled', seatId: '1', dice: [3, 4], animationMs: 1400 }).event, { reduced: false });
    expect(schedule.phases.map((p) => p.name)).toEqual(['tumble', 'settle']);
    expect(schedule.resolveAt).toBeCloseTo(1008);
    expect(schedule.total).toBe(1400);
  });

  it('times a walk from its length: lead, a beat per square, settle, and the token lands as the walk ends', () => {
    const schedule = eventSchedule(walk(4, 450 + 4 * 170 + 450), { reduced: false });
    expect(phase(schedule, 'lead')!.end).toBeCloseTo(450);
    expect(phase(schedule, 'walk')!.start).toBeCloseTo(450);
    expect(phase(schedule, 'walk')!.end).toBeCloseTo(1130);
    expect(schedule.resolveAt).toBeCloseTo(1130);
    stepTimes(schedule, 4).forEach((at, i) => expect(at).toBeCloseTo([620, 790, 960, 1130][i]!));
  });

  it('stretches the phases to fit when the server retimes an event', () => {
    const schedule = eventSchedule(walk(2, (450 + 2 * 170 + 450) * 2), { reduced: false });
    expect(phase(schedule, 'lead')!.end).toBeCloseTo(900);
    expect(schedule.resolveAt).toBeCloseTo(900 + 680);
  });

  it('flies to the room, pulls the suspect in, then asks round the table one beat each', () => {
    const event = eventMessage({
      kind: 'suggested',
      seatId: '1',
      suspect: 'rook',
      weapon: 'vial',
      room: 'parlor',
      suspectFrom: { kind: 'hall', x: 23, y: 18 },
      weaponFrom: 'gallery',
      pulledSeatId: '3',
      passed: ['2'],
      refuterSeatId: '3',
      animationMs: 2600,
    }).event;
    const schedule = eventSchedule(event, { reduced: false });
    expect(schedule.phases.map((p) => p.name)).toEqual(['fly', 'pull', 'ask']);
    expect(schedule.resolveAt).toBeCloseTo(1430);
    const cues = askCues(schedule, 1);
    expect(cues.passes).toHaveLength(1);
    expect(cues.passes[0]).toBeGreaterThan(phase(schedule, 'ask')!.start);
    expect(cues.verdict).toBeGreaterThan(cues.passes[0]!);
    expect(cues.verdict).toBeLessThan(schedule.total);
  });

  it('cuts straight to the result under reduced motion, while the turn still waits the full span', () => {
    const schedule = eventSchedule(walk(6, 2000), { reduced: true });
    expect(schedule.phases).toEqual([{ name: 'cut', start: 0, end: REDUCED_RESOLVE_MS }]);
    expect(schedule.resolveAt).toBe(REDUCED_RESOLVE_MS);
    expect(schedule.total).toBe(2000);
  });

  it('seeks to any moment and drops cues a late arrival already missed', () => {
    const schedule = eventSchedule(walk(4, 1580), { reduced: false });
    const states = seek(schedule, 600).map((s) => `${s.phase.name}:${s.state}`);
    expect(states).toEqual(['lead:past', 'walk:active', 'settle:future']);
    expect(isResolved(schedule, 1579)).toBe(false);
    expect(isResolved(schedule, 1580)).toBe(true);
    expect(pendingCues(stepTimes(schedule, 4), 800).map(Math.round)).toEqual([960, 1130]);
  });
});
