import { describe, expect, it, vi } from 'vitest';
import { describeError, TableController, type SessionPort } from '../../src/client/controller.js';
import { TableModel } from '../../src/client/model.js';
import { viewModel } from '../../src/client/view-model.js';
import type { TableSnapshot } from '../../src/protocol.js';
import { startPositions } from '../../src/rules/board.js';
import { snapshot, turn, you } from './support.js';

function setup(presented: TableSnapshot, options: { confirm?: boolean } = {}) {
  const model = new TableModel('table-1');
  model.presented = presented;
  const session: SessionPort = {
    seated: true,
    chooseSuspect: vi.fn(),
    ready: vi.fn(),
    unready: vi.fn(),
    startGame: vi.fn(),
    roll: vi.fn(),
    takePassage: vi.fn(),
    move: vi.fn(),
    suggest: vi.fn(),
    showCard: vi.fn(),
    accuse: vi.fn(),
    endTurn: vi.fn(),
    newGame: vi.fn(),
    claimAbandoned: vi.fn(),
    leave: vi.fn(),
    sit: vi.fn(),
  };
  const ui = { toast: vi.fn(), announce: vi.fn(), confirm: vi.fn(() => options.confirm ?? true), render: vi.fn() };
  const vm = () => viewModel(model.presented, { serverNow: 5_000, resolving: false, pending: model.pending });
  const controller = new TableController(model, session, ui, { vm });
  return { model, session, ui, controller };
}

describe('table controller', () => {
  it('rolls once: the button stays held until the server answers', () => {
    const t = setup(snapshot());
    t.controller.roll();
    t.controller.roll();
    expect(t.session.roll).toHaveBeenCalledTimes(1);
    expect(t.model.pending).toBe('roll');
    t.controller.onError({ type: 'error', code: 'turn_not_open' });
    expect(t.model.pending).toBeNull();
    expect(t.ui.toast).not.toHaveBeenCalled();
  });

  it('reads out why an action is refused instead of sending it', () => {
    const t = setup(snapshot({ currentSeatId: '2' }));
    t.controller.roll();
    expect(t.session.roll).not.toHaveBeenCalled();
    expect(t.ui.announce).toHaveBeenCalledWith("It is Sleuth's turn.");
  });

  it('moves only to a destination the roll reaches', () => {
    const t = setup(snapshot({ turn: turn({ phase: 'moving', dice: [1, 2] }) }));
    t.controller.move({ kind: 'hall', x: 7, y: 9 });
    expect(t.session.move).not.toHaveBeenCalled();
    expect(t.ui.announce).toHaveBeenCalledWith('That is out of reach with this roll.');
    t.controller.move({ kind: 'hall', x: 7, y: 3 });
    expect(t.session.move).toHaveBeenCalledWith({ kind: 'hall', x: 7, y: 3 });
  });

  it('suggests in the room you entered, and shows only a card that matches', () => {
    const inParlor = { ...startPositions(), vesper: { kind: 'room' as const, room: 'parlor' as const } };
    const t = setup(snapshot({ positions: inParlor, turn: turn({ phase: 'moved', enteredRoom: 'parlor', dice: [4, 4] }) }));
    t.controller.suggest('rook', 'vial');
    expect(t.session.suggest).toHaveBeenCalledWith('rook', 'vial');

    const refuting = setup(
      snapshot({
        currentSeatId: '2',
        turn: turn({ phase: 'refuting', refuterSeatId: '1' }),
        you: you({ refute: { suggesterSeatId: '2', suggestion: { suspect: 'rook', weapon: 'vial', room: 'parlor' }, matching: ['rook'] } }),
      }),
    );
    refuting.controller.showCard('vial');
    expect(refuting.session.showCard).not.toHaveBeenCalled();
    refuting.controller.showCard('rook');
    expect(refuting.session.showCard).toHaveBeenCalledWith('rook');
  });

  it('accuses and ends the turn on your own turn only', () => {
    const t = setup(snapshot({ turn: turn({ phase: 'moved', dice: [2, 2] }) }));
    t.controller.accuse('duarte', 'bust', 'foyer');
    expect(t.session.accuse).toHaveBeenCalledWith('duarte', 'bust', 'foyer');
    const other = setup(snapshot({ currentSeatId: '3', turn: turn({ phase: 'moved' }) }));
    other.controller.endTurn();
    expect(other.session.endTurn).not.toHaveBeenCalled();
  });

  it('asks before leaving mid-case or clearing away detectives', () => {
    const t = setup(snapshot(), { confirm: false });
    t.controller.leave();
    t.controller.claimAbandoned();
    expect(t.ui.confirm).toHaveBeenCalledWith('Leave the table? You drop out of this case and your cards are laid face up for everyone.');
    expect(t.session.leave).not.toHaveBeenCalled();
    expect(t.session.claimAbandoned).not.toHaveBeenCalled();
  });

  it('toasts server refusals in plain words, and stays quiet about the turn lock', () => {
    expect(describeError({ type: 'error', code: 'suspect_taken' })).toBe('Another detective already plays that suspect.');
    expect(describeError({ type: 'error', code: 'turn_not_open' })).toBeNull();
  });
});
