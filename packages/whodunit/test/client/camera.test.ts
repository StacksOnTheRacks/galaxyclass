import { describe, expect, it } from 'vitest';
import { cameraKeyframes, cameraPlan, focusView, FULL_VIEW, MIN_VIEW, viewTransform } from '../../src/client/fx/camera.js';
import { eventSchedule } from '../../src/client/fx/timeline.js';
import { roomCenter } from '../../src/client/geometry.js';
import { startPositions } from '../../src/rules/board.js';
import { eventMessage } from './support.js';

const context = {
  positions: startPositions(),
  suspectOf: (seatId: string) => (({ '1': 'vesper', '2': 'finch', '3': 'rook' }) as const)[seatId as '1'] ?? null,
};

describe('board camera', () => {
  it('rests on the whole mansion with an identity transform', () => {
    expect(viewTransform(FULL_VIEW)).toBe('translate(0px, 0px) scale(1)');
  });

  it('frames points in a square at least MIN_VIEW across, kept inside the board', () => {
    const view = focusView([{ x: 2, y: 2 }]);
    expect(view.w).toBe(MIN_VIEW);
    expect(view.h).toBe(MIN_VIEW);
    expect(view.x).toBe(FULL_VIEW.x);
    expect(view.y).toBe(FULL_VIEW.y);
    const far = focusView([{ x: 238, y: 238 }]);
    expect(far.x + far.w).toBeCloseTo(FULL_VIEW.x + FULL_VIEW.w);
    const wide = focusView([
      { x: 0, y: 0 },
      { x: 240, y: 240 },
    ]);
    expect(wide).toEqual(FULL_VIEW);
  });

  it('zooms in by the ratio of the views', () => {
    expect(viewTransform({ x: 60, y: 60, w: 126, h: 126 })).toBe('translate(-126px, -126px) scale(2)');
  });

  it('follows the roller, the walker’s whole path, the suggestion’s room, and the case file', () => {
    const rolled = eventMessage({ kind: 'rolled', seatId: '2', dice: [1, 2], animationMs: 1400 }).event;
    const rollPlan = cameraPlan(rolled, eventSchedule(rolled, { reduced: false }), context)!;
    expect(rollPlan.focus.w).toBe(110);
    expect(rollPlan.inEnd).toBeLessThan(rollPlan.outStart);

    const moved = eventMessage({
      kind: 'moved',
      seatId: '1',
      suspect: 'vesper',
      via: 'walk',
      path: [
        { kind: 'hall', x: 7, y: 0 },
        { kind: 'hall', x: 7, y: 1 },
        { kind: 'hall', x: 7, y: 2 },
      ],
      animationMs: 1240,
    }).event;
    const walkSchedule = eventSchedule(moved, { reduced: false });
    const walkPlan = cameraPlan(moved, walkSchedule, context)!;
    expect(walkPlan.inEnd).toBe(450);
    expect(walkPlan.outStart).toBe(walkSchedule.resolveAt);

    const suggested = eventMessage({
      kind: 'suggested',
      seatId: '1',
      suspect: 'rook',
      weapon: 'vial',
      room: 'parlor',
      suspectFrom: { kind: 'hall', x: 23, y: 18 },
      weaponFrom: 'gallery',
      pulledSeatId: null,
      passed: [],
      refuterSeatId: null,
      animationMs: 2600,
    }).event;
    const suggestPlan = cameraPlan(suggested, eventSchedule(suggested, { reduced: false }), context)!;
    const center = roomCenter('parlor');
    expect(center.x).toBeGreaterThan(suggestPlan.focus.x);
    expect(center.x).toBeLessThan(suggestPlan.focus.x + suggestPlan.focus.w);

    const passage = eventMessage({ kind: 'moved', seatId: '1', suspect: 'vesper', via: 'passage', path: [{ kind: 'room', room: 'observatory' }, { kind: 'room', room: 'parlor' }], animationMs: 1700 }).event;
    expect(cameraPlan(passage, eventSchedule(passage, { reduced: false }), context)).toBeNull();
    const turn = eventMessage({ kind: 'turn_passed', seatId: '1', nextSeatId: '2', animationMs: 700 }).event;
    expect(cameraPlan(turn, eventSchedule(turn, { reduced: false }), context)).toBeNull();
  });

  it('eases in and back out, or cuts in and out with no easing under reduced motion', () => {
    const accused = eventMessage({ kind: 'accused', seatId: '1', suspect: 'rook', weapon: 'vial', room: 'parlor', correct: false, animationMs: 3600 }).event;
    const plan = cameraPlan(accused, eventSchedule(accused, { reduced: false }), context)!;
    const smooth = cameraKeyframes(plan, false);
    expect(smooth.duration).toBe(3600);
    expect(smooth.keyframes[0]!.transform).toBe(viewTransform(FULL_VIEW));
    expect(smooth.keyframes.at(-1)!.transform).toBe(viewTransform(FULL_VIEW));
    expect(smooth.keyframes[2]!.transform).toBe(viewTransform(plan.focus));
    const cut = cameraKeyframes(plan, true);
    expect(cut.keyframes.every((frame) => frame.transform === viewTransform(plan.focus))).toBe(true);
    expect(cut.duration).toBe(plan.outStart);
  });
});
