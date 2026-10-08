// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventSchedule } from '../../src/client/fx/timeline.js';
import { suspectSlot, tokenPoint, weaponSlot } from '../../src/client/geometry.js';
import { viewModel } from '../../src/client/view-model.js';
import { BoardView } from '../../src/client/views/board.js';
import type { TableSnapshot } from '../../src/protocol.js';
import { ROOM_LAYOUT, startPositions } from '../../src/rules/board.js';
import { ROOM_IDS } from '../../src/rules/constants.js';
import { eventMessage, setupSnapshot, snapshot, turn } from './support.js';

const ctx = { serverNow: 5_000, resolving: false };

function board(state: TableSnapshot) {
  const move = vi.fn();
  const view = new BoardView({ move });
  document.body.replaceChildren(view.root);
  view.update(state, viewModel(state, ctx));
  return { view, move, root: view.svgEl };
}

const translate = (p: { x: number; y: number }) => `translate(${Math.round(p.x * 100) / 100}px, ${Math.round(p.y * 100) / 100}px)`;

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('mansion board', () => {
  it('draws all nine rooms, their doors, the four secret passages, and the case file', () => {
    const { root } = board(snapshot());
    expect([...root.querySelectorAll('.wd-room')].map((r) => r.getAttribute('data-room'))).toEqual([...ROOM_IDS]);
    const doors = ROOM_IDS.reduce((n, id) => n + ROOM_LAYOUT[id].doors.length, 0);
    expect(root.querySelectorAll('.wd-door')).toHaveLength(doors);
    expect([...root.querySelectorAll('.wd-passage')].map((p) => p.getAttribute('data-passage')).sort()).toEqual(['cellar', 'greenhouse', 'observatory', 'parlor']);
    expect(root.querySelector('[data-testid="case-file"]')).not.toBeNull();
    expect(root.querySelector('.wd-room-name')?.textContent).toBe('Observatory');
  });

  it('puts every suspect token where the snapshot has it, each in its own spot in a room', () => {
    const positions = { ...startPositions(), vesper: { kind: 'room' as const, room: 'parlor' as const }, rook: { kind: 'room' as const, room: 'parlor' as const } };
    const { root } = board(snapshot({ positions }));
    const vesper = root.querySelector<SVGGElement>('[data-suspect="vesper"]')!;
    const rook = root.querySelector<SVGGElement>('[data-suspect="rook"]')!;
    expect(vesper.style.transform).toBe(translate(suspectSlot('parlor', 'vesper')));
    expect(rook.style.transform).toBe(translate(suspectSlot('parlor', 'rook')));
    expect(vesper.style.transform).not.toBe(rook.style.transform);
    expect(vesper.dataset.mine).toBe('true');
    expect(vesper.dataset.turn).toBe('true');
    expect(root.querySelector<SVGGElement>('[data-suspect="juniper"]')!.dataset.active).toBe('false');
    const finch = root.querySelector<SVGGElement>('[data-suspect="finch"]')!;
    expect(finch.style.transform).toBe(translate(tokenPoint(startPositions().finch, 'finch')));
  });

  it('shows weapon tokens in their rooms once the case is open, and none before', () => {
    const playing = board(snapshot());
    const vial = playing.root.querySelector<SVGGElement>('[data-weapon="vial"]')!;
    expect(vial.style.display).toBe('');
    expect(vial.style.transform).toBe(translate(weaponSlot('gallery', 'vial')));
    const setup = board(setupSnapshot());
    expect(setup.root.querySelector<SVGGElement>('[data-weapon="vial"]')!.style.display).toBe('none');
  });

  it('lights exactly the destinations the roll reaches, and moves on a click or Enter', () => {
    const state = snapshot({ turn: turn({ phase: 'moving', dice: [1, 2] }) });
    const { view, move, root } = board(state);
    const expected = viewModel(state, ctx).destinations.length;
    expect(root.querySelectorAll('[data-dest]')).toHaveLength(expected);
    expect(view.destinations()).toContain('hall:7,3');
    const target = root.querySelector<SVGRectElement>('[data-dest="hall:7,3"]')!;
    expect(target.getAttribute('role')).toBe('button');
    expect(target.getAttribute('aria-label')).toBe('Move to Hall square 8, 4, 3 steps');
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(move).toHaveBeenCalledWith({ kind: 'hall', x: 7, y: 3 });
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(move).toHaveBeenCalledTimes(2);
  });

  it('traces the route while you point at a destination', () => {
    const { root } = board(snapshot({ turn: turn({ phase: 'moving', dice: [1, 2] }) }));
    root.querySelector('[data-dest="hall:7,3"]')!.dispatchEvent(new Event('pointerenter'));
    expect(root.querySelector('.wd-path-line')?.getAttribute('points')?.split(' ')).toHaveLength(4);
    root.querySelector('[data-dest="hall:7,3"]')!.dispatchEvent(new Event('pointerleave'));
    expect(root.querySelector('.wd-path-line')).toBeNull();
  });

  it('lights nothing when it is not your move', () => {
    const { root } = board(snapshot({ currentSeatId: '2', turn: turn({ phase: 'moving', dice: [6, 6] }) }));
    expect(root.querySelectorAll('[data-dest]')).toHaveLength(0);
  });

  it('plays an event without throwing, with or without motion, and stops cleanly', () => {
    const { view } = board(snapshot());
    const message = eventMessage({
      kind: 'suggested',
      seatId: '1',
      suspect: 'rook',
      weapon: 'vial',
      room: 'parlor',
      suspectFrom: { kind: 'hall', x: 23, y: 18 },
      weaponFrom: 'gallery',
      pulledSeatId: '3',
      passed: [],
      refuterSeatId: '2',
      animationMs: 2600,
    });
    for (const reduced of [false, true]) {
      expect(() => view.playEvent(message, eventSchedule(message.event, { reduced }), 300, snapshot())).not.toThrow();
    }
    view.stop();
  });
});
