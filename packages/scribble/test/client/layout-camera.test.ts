import { describe, expect, it } from 'vitest';
import {
  clampCamera,
  fitCamera,
  fitZoom,
  isZoomedIn,
  MAX_ZOOM_FACTOR,
  panBy,
  resizeCamera,
  screenToWorld,
  wheelFactor,
  worldToScreen,
  zoomAt,
} from '../../src/client/camera.js';
import { BOARD_PX, CELL, cellAt, cellCenter, FRAME, layoutFor, nearestRackSlot, rackSlotAt, rackSlots } from '../../src/client/layout.js';

const layout = layoutFor(1280, 900);
const vp = layout.board;

describe('board geometry', () => {
  it('maps every square centre back to its own square and the frame to nothing', () => {
    for (const [row, col] of [
      [0, 0],
      [7, 7],
      [14, 14],
      [3, 11],
    ] as const) {
      const c = cellCenter(row, col);
      expect(cellAt(c.x, c.y)).toEqual({ row, col });
    }
    expect(cellAt(FRAME - 1, FRAME + 5)).toBeNull();
    expect(cellAt(BOARD_PX - 2, BOARD_PX - 2)).toBeNull();
    expect(cellAt(FRAME + CELL * 15 - 1, FRAME)).toEqual({ row: 0, col: 14 });
  });

  it('keeps the board between the top bar and the rack, and the rack above the controls', () => {
    expect(vp.y).toBeGreaterThanOrEqual(64);
    expect(vp.y + vp.height).toBeLessThanOrEqual(layout.rack.y);
    expect(layout.rack.y + layout.rack.height).toBeLessThanOrEqual(900 - 64);
  });

  it('scales every region with the device pixel ratio', () => {
    const dense = layoutFor(2560, 1800, 2);
    expect(dense.board.y).toBe(vp.y * 2);
    expect(dense.tileSize).toBe(layout.tileSize * 2);
    expect(dense.rack.y).toBe(layout.rack.y * 2);
  });

  it('finds rack slots by position and snaps a drop to the nearest slot', () => {
    const slots = rackSlots(layout, 7);
    expect(slots).toHaveLength(7);
    expect(rackSlotAt(layout, slots[3]!.x, slots[3]!.y)).toBe(3);
    expect(rackSlotAt(layout, slots[0]!.x, layout.rack.y - 20)).toBeNull();
    expect(nearestRackSlot(layout, slots[5]!.x + 4)).toBe(5);
    expect(nearestRackSlot(layout, -100)).toBe(0);
  });
});

describe('board camera', () => {
  it('fits the board and centres it along the long axis', () => {
    const cam = fitCamera(vp);
    expect(cam.zoom).toBeCloseTo(fitZoom(vp));
    const topLeft = worldToScreen(cam, vp, 0, 0);
    const bottomRight = worldToScreen(cam, vp, BOARD_PX, BOARD_PX);
    expect(topLeft.y).toBeCloseTo(vp.y);
    expect(bottomRight.y).toBeCloseTo(vp.y + vp.height);
    expect((topLeft.x + bottomRight.x) / 2).toBeCloseTo(vp.x + vp.width / 2);
  });

  it('round-trips screen and world points', () => {
    const cam = zoomAt(fitCamera(vp), vp, 2, vp.x + 100, vp.y + 80);
    const world = screenToWorld(cam, vp, 500, 400);
    expect(worldToScreen(cam, vp, world.x, world.y)).toEqual({ x: expect.closeTo(500), y: expect.closeTo(400) });
  });

  it('zooms around the pointer so the square under it stays put', () => {
    const cam = fitCamera(vp);
    const anchor = { x: vp.x + vp.width / 2 + 40, y: vp.y + vp.height / 2 - 30 };
    const before = screenToWorld(cam, vp, anchor.x, anchor.y);
    const zoomed = zoomAt(cam, vp, 2.5, anchor.x, anchor.y);
    const after = screenToWorld(zoomed, vp, anchor.x, anchor.y);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('clamps zoom between fit and the maximum, and never shows past the board edge', () => {
    const min = fitZoom(vp);
    expect(zoomAt(fitCamera(vp), vp, 0.2, vp.x, vp.y).zoom).toBeCloseTo(min);
    expect(zoomAt(fitCamera(vp), vp, 50, vp.x, vp.y).zoom).toBeCloseTo(min * MAX_ZOOM_FACTOR);
    const deep = clampCamera({ zoom: min * 2, scrollX: -500, scrollY: 99999 }, vp);
    expect(deep.scrollX).toBeGreaterThanOrEqual(0);
    expect(deep.scrollY + vp.height / deep.zoom).toBeCloseTo(BOARD_PX);
  });

  it('pans only once zoomed in', () => {
    const fit = fitCamera(vp);
    expect(isZoomedIn(fit, vp)).toBe(false);
    expect(panBy(fit, vp, 120, 80)).toEqual(fit);
    const zoomed = zoomAt(fit, vp, 2.5, vp.x + vp.width / 2, vp.y + vp.height / 2);
    expect(isZoomedIn(zoomed, vp)).toBe(true);
    const panned = panBy(zoomed, vp, 60, 0);
    expect(panned.scrollX).toBeCloseTo(zoomed.scrollX - 60 / zoomed.zoom);
  });

  it('turns wheel deltas into gentle zoom factors in the right direction', () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(-10_000)).toBeCloseTo(wheelFactor(-200));
  });

  it('keeps the relative zoom across a resize', () => {
    const zoomed = zoomAt(fitCamera(vp), vp, 2, vp.x + vp.width / 2, vp.y + vp.height / 2);
    const smaller = layoutFor(800, 700).board;
    const resized = resizeCamera(zoomed, vp, smaller);
    expect(resized.zoom / fitZoom(smaller)).toBeCloseTo(zoomed.zoom / fitZoom(vp));
  });
});
