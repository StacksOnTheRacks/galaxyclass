import { describe, expect, it } from 'vitest';
import {
  beamAngle,
  cellCenter,
  colMarkerCenter,
  isResolved,
  pendingCues,
  phase,
  rowMarkerCenter,
  seek,
  shotSchedule,
  sweepCues,
  trackCues,
} from '../../src/client/fx/timeline.js';
import { SHOT_ANIMATION_MS, SINK_ANNOUNCE_MS } from '../../src/rules/constants.js';

const bounds = (s: ReturnType<typeof shotSchedule>) => s.phases.map((p) => [p.name, Math.round(p.start), Math.round(p.end)]);

describe('shot timeline', () => {
  it('lays out lock-in, sweep, track, and resolve over a 2 200 ms shot', () => {
    const s = shotSchedule({ animationMs: SHOT_ANIMATION_MS, sunk: false, reduced: false });
    expect(bounds(s)).toEqual([
      ['lock', 0, 150],
      ['sweep', 150, 1050],
      ['track', 1050, 1750],
      ['resolve', 1750, 2200],
    ]);
    expect(s.resolveAt).toBe(1750);
    expect(s.sinkAt).toBeNull();
    expect(s.total).toBe(2200);
  });

  it('adds the sink announcement after resolve for a 3 800 ms sinking shot', () => {
    const s = shotSchedule({ animationMs: SHOT_ANIMATION_MS + SINK_ANNOUNCE_MS, sunk: true, reduced: false });
    expect(bounds(s).at(-1)).toEqual(['sink', 2200, 3800]);
    expect(s.sinkAt).toBe(2200);
    expect(s.total).toBe(3800);
  });

  it('stretches the phases in proportion when the server retimes a shot', () => {
    const s = shotSchedule({ animationMs: 4400, sunk: false, reduced: false });
    expect(phase(s, 'sweep')).toEqual({ name: 'sweep', start: 300, end: 2100 });
    expect(s.resolveAt).toBe(3500);
  });

  it('seeks: phases behind, inside, and ahead of the elapsed time', () => {
    const s = shotSchedule({ animationMs: 2200, sunk: false, reduced: false });
    const at = seek(s, 1200);
    expect(at.map((p) => [p.phase.name, p.state])).toEqual([
      ['lock', 'past'],
      ['sweep', 'past'],
      ['track', 'active'],
      ['resolve', 'future'],
    ]);
    expect(at[2]!.into).toBe(150);
    expect(isResolved(s, 2199)).toBe(false);
    expect(isResolved(s, 2200)).toBe(true);
  });

  it('under reduced motion highlights at once, marks at 400 ms, and keeps the server’s turn pacing', () => {
    const s = shotSchedule({ animationMs: 3800, sunk: true, reduced: true });
    expect(s.reduced).toBe(true);
    expect(s.phases.map((p) => p.name)).toEqual(['lock', 'resolve', 'sink']);
    expect(s.resolveAt).toBe(400);
    expect(s.sinkAt).toBe(2200);
    expect(s.total).toBe(3800);
    expect(phase(s, 'sweep')).toBeNull();
    expect(sweepCues(s)).toEqual([]);
  });

  it('flashes each coordinate marker as the beam passes it, clockwise from 12 o’clock', () => {
    expect(beamAngle({ x: 6, y: 0 })).toBe(0);
    expect(beamAngle({ x: 12, y: 6 })).toBe(90);
    expect(beamAngle({ x: 0, y: 6 })).toBe(270);
    const s = shotSchedule({ animationMs: 2200, sunk: false, reduced: false });
    const cues = sweepCues(s);
    expect(cues).toHaveLength(20);
    expect(cues.every((c) => c.at >= 150 && c.at <= 1050)).toBe(true);
    // Column markers sit on the top edge, row markers on the left: the top-right columns light first.
    expect(cues[0]).toMatchObject({ axis: 'col', index: 5 });
    expect(cues.at(-1)).toMatchObject({ axis: 'col', index: 4 });
    const a = cues.find((c) => c.axis === 'row' && c.index === 0)!;
    const j = cues.find((c) => c.axis === 'row' && c.index === 9)!;
    expect(j.at).toBeLessThan(a.at);
    expect(rowMarkerCenter(0)).toEqual({ x: 0.5, y: 1.5 });
    expect(colMarkerCenter(9)).toEqual({ x: 10.5, y: 0.5 });
  });

  it('ticks down the row markers and across the column markers to the target', () => {
    const s = shotSchedule({ animationMs: 2200, sunk: false, reduced: false });
    const { step, cues } = trackCues(s, { row: 2, col: 6 });
    expect(cues.filter((c) => c.axis === 'row').map((c) => c.index)).toEqual([0, 1, 2]);
    expect(cues.filter((c) => c.axis === 'col').map((c) => c.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(step).toBeCloseTo((700 - 300) / 7);
    const last = cues.filter((c) => c.axis === 'col').at(-1)!;
    expect(last.at).toBeLessThan(1750 - 299);
    expect(cellCenter({ row: 2, col: 6 })).toEqual({ x: 7.5, y: 3.5 });
  });

  it('drops cues a late joiner has already missed', () => {
    const s = shotSchedule({ animationMs: 2200, sunk: false, reduced: false });
    const cues = sweepCues(s);
    expect(pendingCues(cues, 600).every((c) => c.at >= 600)).toBe(true);
    expect(pendingCues(cues, 2000)).toEqual([]);
  });
});
