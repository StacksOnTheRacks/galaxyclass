// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShotClock } from '../../src/client/fx/animate.js';
import { playShotFx } from '../../src/client/fx/sonar.js';
import { shotSchedule } from '../../src/client/fx/timeline.js';
import { ownBoard, targetBoard, viewModel } from '../../src/client/view-model.js';
import { BoardView } from '../../src/client/views/board.js';
import { FLEET_A, shotEvent, snapshot } from './support.js';

interface FakeAnimation {
  el: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  currentTime: number | null;
  cancel(): void;
  cancelled: boolean;
}

let animations: FakeAnimation[] = [];
const originalAnimate = Element.prototype.animate;

beforeEach(() => {
  animations = [];
  Element.prototype.animate = function (this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    const animation: FakeAnimation = {
      el: this,
      keyframes,
      options,
      currentTime: null,
      cancelled: false,
      cancel() {
        this.cancelled = true;
      },
    };
    animations.push(animation);
    return animation as unknown as Animation;
  } as typeof Element.prototype.animate;
  document.body.innerHTML = '';
});

afterEach(() => {
  Element.prototype.animate = originalAnimate;
});

describe('target board', () => {
  it('is a labelled grid of fire buttons with coordinate headers', () => {
    const board = new BoardView('target', 'Enemy waters');
    board.render(targetBoard({ seatId: '2', shots: [{ row: 2, col: 6, result: 'miss', turnNumber: 1 }], sunk: [], revealed: null }), {
      interactive: true,
    });
    expect(board.grid.getAttribute('role')).toBe('grid');
    expect(board.grid.getAttribute('aria-label')).toBe('Enemy waters');
    expect(board.colMarkers.map((m) => m.textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(board.rowMarkers.map((m) => m.textContent)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
    expect(board.colMarkers[0]!.getAttribute('role')).toBe('columnheader');
    const cell = board.cells[0]![0]!;
    expect(cell.tagName).toBe('BUTTON');
    expect(cell.getAttribute('role')).toBe('gridcell');
    expect(cell.getAttribute('aria-label')).toBe('A1, unexplored');
    expect(cell.getAttribute('aria-disabled')).toBe('false');
    expect(board.cells[2]![6]!.getAttribute('aria-label')).toBe('C7, miss');
    expect(board.cells[2]![6]!.getAttribute('aria-disabled')).toBe('true');
    // Roving tabindex: one tab stop.
    expect(board.cells.flat().filter((c) => c.tabIndex === 0)).toHaveLength(1);
  });

  it('fires from the keyboard and pointer, never at an explored cell, and leaves the turn check to the controller', () => {
    const board = new BoardView('target', 'Enemy waters');
    document.body.append(board.root);
    const fired: string[] = [];
    board.onFire = (c) => fired.push(`${c.row},${c.col}`);
    const model = targetBoard({ seatId: '2', shots: [{ row: 0, col: 1, result: 'hit', turnNumber: 1 }], sunk: [], revealed: null });
    board.render(model, { interactive: true });

    const key = (k: string) => board.grid.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    key('ArrowDown');
    key('ArrowRight');
    key('ArrowRight');
    expect(board.focusedCell).toEqual({ row: 1, col: 2 });
    expect(document.activeElement).toBe(board.cells[1]![2]);
    key('Enter');
    key('End');
    key(' ');
    board.cells[0]![1]!.click();
    board.cells[5]![5]!.click();
    expect(fired).toEqual(['1,2', '1,9', '5,5']);

    board.render(model, { interactive: false, disabledReason: "It is Captain's turn." });
    expect(board.cells[5]![5]!.getAttribute('aria-disabled')).toBe('true');
    expect(board.grid.getAttribute('aria-description')).toBe("It is Captain's turn.");
    // The render may lag the turn opening by a few ms; the click still reaches the controller.
    board.cells[6]![6]!.click();
    board.cells[0]![1]!.click();
    expect(fired).toEqual(['1,2', '1,9', '5,5', '6,6']);
  });

  it('wires the view model through: cells disable when it is not your turn', () => {
    const board = new BoardView('target', 'Enemy waters');
    const vm = viewModel(snapshot({ currentSeatId: '2', turnNumber: 1 }), null, { serverNow: 10_000, resolving: false });
    board.render(vm.target, { interactive: vm.canFire, disabledReason: vm.fireBlockedReason });
    expect(board.root.dataset.interactive).toBe('false');
    expect(board.cells.flat().every((c) => c.getAttribute('aria-disabled') === 'true')).toBe(true);
  });

  it('draws only sunk ships on the target board, and marks new pegs as fresh', () => {
    const board = new BoardView('target', 'Enemy waters');
    board.render(targetBoard({ seatId: '2', shots: [], sunk: [], revealed: null }), { interactive: true });
    board.render(
      targetBoard({
        seatId: '2',
        shots: [
          { row: 0, col: 9, result: 'hit', turnNumber: 1 },
          { row: 1, col: 9, result: 'hit', turnNumber: 3 },
          { row: 0, col: 5, result: 'hit', turnNumber: 5 },
        ],
        sunk: [{ shipId: 'destroyer', row: 0, col: 9, orientation: 'vertical', length: 2, sunkOnTurn: 3 }],
        revealed: null,
      }),
      { interactive: true },
    );
    const ships = [...board.shipsLayer.querySelectorAll<HTMLElement>('.ws-ship')];
    expect(ships.map((s) => [s.dataset.ship, s.dataset.state])).toEqual([['destroyer', 'sunk']]);
    expect(board.cells[0]![5]!.querySelector<HTMLElement>('.ws-peg')?.dataset).toMatchObject({ result: 'hit', fresh: 'true' });
    expect(board.cells[0]![5]!.dataset.ship).toBe('');
  });
});

describe('own board', () => {
  it('shows your fleet and labels incoming fire', () => {
    const board = new BoardView('own', 'Your waters');
    board.render(ownBoard(FLEET_A, [{ row: 2, col: 2, result: 'hit', turnNumber: 2 }]), { interactive: false });
    expect(board.cells[0]![0]!.tagName).toBe('DIV');
    expect(board.shipsLayer.querySelectorAll('.ws-ship')).toHaveLength(5);
    expect(board.cells[2]![2]!.getAttribute('aria-label')).toBe('C3, Cruiser, hit');
    expect(board.shipElement('carrier')?.style.width).toBe('45.4545%');
  });
});

describe('shot effects', () => {
  const play = (mode: 'own' | 'target', elapsed: number, overrides = {}) => {
    const board = new BoardView(mode, mode);
    const shot = shotEvent(overrides);
    const schedule = shotSchedule({ animationMs: shot.animationMs, sunk: Boolean(shot.sunkShip), reduced: false });
    const clock = new ShotClock(elapsed);
    const cleanup = playShotFx(board, shot, schedule, clock, mode === 'target' ? 'outgoing' : 'incoming');
    return { board, clock, cleanup, schedule };
  };

  it('seeks every animation of a shot to the same elapsed time', () => {
    const { clock } = play('target', 1234);
    expect(clock.animations.length).toBeGreaterThan(20);
    expect(animations.every((a) => a.currentTime === 1234)).toBe(true);
    // Nothing starts before the shot or runs past its end.
    const ends = animations.map((a) => Number(a.options.delay ?? 0) + Number(a.options.duration) * Number(a.options.iterations ?? 1));
    expect(Math.min(...animations.map((a) => Number(a.options.delay ?? 0)))).toBe(0);
    expect(Math.max(...ends)).toBeLessThanOrEqual(2200);

    animations = [];
    play('target', 0, { result: 'hit' });
    expect(Math.max(...animations.map((a) => Number(a.options.delay ?? 0) + Number(a.options.duration)))).toBeLessThanOrEqual(2200);
  });

  it('flashes the coordinate markers during the sweep and tracks to the target', () => {
    const { board } = play('target', 0);
    const glows = animations.filter((a) => a.el.classList.contains('ws-marker-glow'));
    expect(new Set(glows.map((a) => a.el)).size).toBe(20);
    const rowC = board.rowMarkers[2]!.querySelector('.ws-marker-glow')!;
    const lastRowC = glows.filter((a) => a.el === rowC).map((a) => Number(a.options.delay)).sort((x, y) => x - y).at(-1)!;
    expect(lastRowC).toBeGreaterThanOrEqual(1050);
  });

  it('draws the same shot identically for the shooter and the defender, apart from the palette', () => {
    const sunk = { shipId: 'cruiser' as const, row: 0, col: 7, orientation: 'vertical' as const, length: 3, sunkOnTurn: 1 };
    const overrides = { result: 'hit' as const, coord: { row: 2, col: 7 }, animationMs: 3800, sunkShip: sunk };
    const shooter = play('target', 0, overrides);
    const defender = play('own', 0, overrides);
    const markup = (b: BoardView) => b.fx.querySelector('.ws-fx-shot')!.outerHTML.replace(/data-tone="\w+"/, '');
    expect(markup(shooter.board)).toBe(markup(defender.board));
    expect(defender.board.fx.querySelector('.ws-fx-shot')!.getAttribute('data-tone')).toBe('incoming');
    expect(shooter.schedule.total).toBe(3800);
  });

  it('removes its overlay when cleaned up', () => {
    const { board, cleanup, clock } = play('target', 500);
    expect(board.fx.querySelector('.ws-fx-shot')).not.toBeNull();
    cleanup();
    clock.cancel();
    expect(board.fx.querySelector('.ws-fx-shot')).toBeNull();
    expect(animations.every((a) => a.cancelled)).toBe(true);
    expect(vi.isMockFunction(Element.prototype.animate)).toBe(false);
  });
});
