import { describe, expect, it, vi } from 'vitest';
import { describeError, TableController, type SessionPort } from '../../src/client/controller.js';
import { TableModel } from '../../src/client/model.js';
import { viewModel } from '../../src/client/view-model.js';
import type { TableSnapshot } from '../../src/protocol.js';
import { snapshot } from './support.js';

function setup(initial: TableSnapshot, serverNow = 10_000) {
  const model = new TableModel('table-1');
  model.present(initial);
  let now = serverNow;
  const session: SessionPort = {
    seated: true,
    placeFleet: vi.fn(),
    unready: vi.fn(),
    fire: vi.fn(),
    forfeit: vi.fn(),
    rematch: vi.fn(),
    claimAbandoned: vi.fn(),
    leave: vi.fn(),
    sit: vi.fn(),
  };
  const ui = { toast: vi.fn(), announce: vi.fn(), confirm: vi.fn(() => true), render: vi.fn() };
  const stored = new Map<string, string>();
  const controller = new TableController(model, session, ui, {
    storage: { setItem: (k, v) => void stored.set(k, v) },
    vm: () => viewModel(model.presented, null, { serverNow: now, resolving: false }),
  });
  return { model, session, ui, controller, stored, setNow: (t: number) => (now = t) };
}

describe('table controller', () => {
  it('fires once the turn is open by the clock at click time, not by the last render', () => {
    const t = setup(snapshot({ turnOpensAt: 10_500 }));
    t.controller.fire({ row: 9, col: 9 });
    expect(t.session.fire).not.toHaveBeenCalled();
    expect(t.ui.announce).toHaveBeenCalledWith('The battle is about to begin.');
    t.setNow(10_500);
    t.controller.fire({ row: 9, col: 9 });
    expect(t.session.fire).toHaveBeenCalledWith({ row: 9, col: 9 });
    expect(t.model.pendingTarget).toEqual({ row: 9, col: 9 });
  });

  it('sends one shot at a time and never at an explored cell', () => {
    const t = setup(snapshot({ target: { seatId: '2', shots: [{ row: 0, col: 0, result: 'miss', turnNumber: 1 }], sunk: [], revealed: null } }));
    t.controller.fire({ row: 0, col: 0 });
    expect(t.session.fire).not.toHaveBeenCalled();
    t.controller.fire({ row: 1, col: 1 });
    t.controller.fire({ row: 2, col: 2 });
    expect(t.session.fire).toHaveBeenCalledTimes(1);
  });

  it('refuses out of turn with the reason, for screen readers', () => {
    const t = setup(snapshot({ currentSeatId: '2', turnNumber: 1 }));
    t.controller.fire({ row: 3, col: 3 });
    expect(t.session.fire).not.toHaveBeenCalled();
    expect(t.ui.announce).toHaveBeenCalledWith("It is Captain's turn.");
  });

  it('clears the pending reticle on a refusal and explains it, except the silent ones', () => {
    const t = setup(snapshot());
    t.controller.fire({ row: 4, col: 4 });
    t.controller.onError({ type: 'error', code: 'not_your_turn' });
    expect(t.model.pendingTarget).toBeNull();
    expect(t.ui.toast).toHaveBeenCalledWith("It's not your turn.", 'error');
    expect(describeError({ type: 'error', code: 'turn_not_open' })).toBeNull();
    expect(describeError({ type: 'error', code: 'invalid_fleet', reason: 'overlap' })).toBe('Two ships overlap.');
  });

  it('remembers a readied fleet for Reuse, and asks before conceding', () => {
    const t = setup(snapshot({ status: 'placing' }));
    const fleet = t.model.presented!.you!.fleet!;
    t.controller.ready(fleet);
    expect(t.session.placeFleet).toHaveBeenCalledWith(fleet);
    expect([...t.stored.keys()]).toEqual(['warships.fleet.table-1']);
    t.ui.confirm.mockReturnValueOnce(false);
    t.controller.forfeit();
    expect(t.session.forfeit).not.toHaveBeenCalled();
  });

  it('exposes the presented snapshot to the dev hook as model.snapshot', () => {
    const t = setup(snapshot({ version: 9 }));
    expect(t.model.snapshot?.version).toBe(9);
  });
});
