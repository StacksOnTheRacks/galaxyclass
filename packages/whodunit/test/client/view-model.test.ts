import { describe, expect, it } from 'vitest';
import { endLine, viewModel } from '../../src/client/view-model.js';
import { positionKey, startPositions } from '../../src/rules/board.js';
import { seat, setupSnapshot, snapshot, turn, you } from './support.js';

const ctx = { serverNow: 5_000, resolving: false };

describe('view model: setup', () => {
  it('asks a detective without a suspect to choose one, and the host why the case cannot open', () => {
    const base = setupSnapshot();
    const vm = viewModel(
      setupSnapshot({ seats: base.seats.map((s) => (s.seatId === '1' ? { ...s, suspect: null } : s)) }),
      ctx,
    );
    expect(vm.screen).toBe('setup');
    expect(vm.status).toBe('Choose your suspect');
    expect(vm.setup.canPick).toBe(true);
    expect(vm.setup.canReady).toBe(false);
    expect(vm.setup.canStart).toBe(false);
    expect(vm.setup.startBlockedReason).toBe('Everyone needs to choose a suspect.');
    expect(vm.setup.picks.find((p) => p.id === 'finch')?.takenBy?.displayName).toBe('Sleuth');
  });

  it('needs three detectives, then everyone ready, before the host may start', () => {
    const two = setupSnapshot();
    two.seats[2] = { ...two.seats[2]!, occupied: false, displayName: null, suspect: null };
    expect(viewModel(two, ctx).setup.startBlockedReason).toBe('A case needs at least 3 detectives (2 seated).');
    expect(viewModel(setupSnapshot(), ctx).setup.startBlockedReason).toBe('Waiting for 3 detectives to ready up.');
    const ready = setupSnapshot({ seats: setupSnapshot().seats.map((s) => ({ ...s, ready: s.occupied })) });
    const host = viewModel(ready, ctx);
    expect(host.setup.canStart).toBe(true);
    expect(host.setup.startBlockedReason).toBeNull();
    expect(host.status).toBe('Everyone is ready — start the case');
    const guest = viewModel({ ...ready, seats: ready.seats.map((s) => ({ ...s, isLocal: s.seatId === '2' })), you: you({ seatId: '2', suspect: 'finch', hand: [] }) }, ctx);
    expect(guest.setup.canStart).toBe(false);
    expect(guest.status).toBe('Waiting for Inspector to start');
  });
});

describe('view model: a turn', () => {
  it('lets you roll at the start of your turn, and offers the secret passage from a corner room', () => {
    const vm = viewModel(snapshot({ positions: { ...startPositions(), vesper: { kind: 'room', room: 'observatory' } } }), ctx);
    expect(vm.screen).toBe('playing');
    expect(vm.myTurn).toBe(true);
    expect(vm.canRoll).toBe(true);
    expect(vm.canPassage).toBe(true);
    expect(vm.passageTo).toBe('parlor');
    expect(vm.canMove).toBe(false);
    expect(vm.hint).toBe('Roll, or take the secret passage to the Parlor.');
  });

  it('lights every destination the roll reaches, from the rules module', () => {
    const vm = viewModel(snapshot({ turn: turn({ phase: 'moving', dice: [1, 2] }) }), ctx);
    expect(vm.canMove).toBe(true);
    expect(vm.canRoll).toBe(false);
    expect(vm.status).toBe('You rolled 3 — choose where to go');
    const keys = vm.destinations.map((r) => positionKey(r.destination));
    // Vesper starts at (7,0): three squares down the hall reach (7,3), and the door at (7,4) is 4 away.
    expect(keys).toContain('hall:7,3');
    expect(keys).not.toContain('hall:7,4');
    expect(vm.destinations.every((r) => r.steps <= 3)).toBe(true);
  });

  it('offers a suggestion only in the room you just entered, or where a suggestion pulled you', () => {
    const inParlor = { ...startPositions(), vesper: { kind: 'room' as const, room: 'parlor' as const } };
    const entered = viewModel(snapshot({ positions: inParlor, turn: turn({ phase: 'moved', dice: [3, 3], enteredRoom: 'parlor' }) }), ctx);
    expect(entered.canSuggest).toBe(true);
    expect(entered.status).toBe('Make a suggestion in the Parlor');
    const stayed = viewModel(snapshot({ positions: inParlor, turn: turn({ phase: 'start' }) }), ctx);
    expect(stayed.canSuggest).toBe(false);
    const pulled = viewModel(snapshot({ positions: inParlor, turn: turn({ phase: 'start' }), you: you({ pulledIn: true }) }), ctx);
    expect(pulled.canSuggest).toBe(true);
    expect(pulled.hint).toBe('You were pulled into the Parlor: you may suggest without moving.');
    const done = viewModel(
      snapshot({ positions: inParlor, turn: turn({ phase: 'suggested', enteredRoom: 'parlor', suggestion: { suspect: 'rook', weapon: 'vial', room: 'parlor' } }) }),
      ctx,
    );
    expect(done.canSuggest).toBe(false);
    expect(done.canAccuse).toBe(true);
    expect(done.canEndTurn).toBe(true);
  });

  it('holds every action while an animation plays, the turn lock runs, a send is pending, or the socket is down', () => {
    const open = snapshot();
    expect(viewModel(open, { ...ctx, resolving: true }).canRoll).toBe(false);
    expect(viewModel(snapshot({ nextActionAt: 9_000 }), ctx).canRoll).toBe(false);
    expect(viewModel(open, { ...ctx, pending: 'roll' }).canRoll).toBe(false);
    expect(viewModel(open, { ...ctx, pending: 'roll' }).hint).toBe('Rolling…');
    expect(viewModel(open, { ...ctx, offline: true }).blockedReason).toBe('Reconnecting…');
  });

  it('tells you whose turn it is when it is not yours', () => {
    const vm = viewModel(snapshot({ currentSeatId: '2' }), ctx);
    expect(vm.myTurn).toBe(false);
    expect(vm.canRoll).toBe(false);
    expect(vm.canAccuse).toBe(false);
    expect(vm.status).toBe('Sleuth is investigating…');
    expect(vm.blockedReason).toBe("It is Sleuth's turn.");
  });

  it('asks you, privately, to show the suggester one of your matching cards', () => {
    const vm = viewModel(
      snapshot({
        currentSeatId: '2',
        turn: turn({ phase: 'refuting', refuterSeatId: '1', suggestion: { suspect: 'rook', weapon: 'vial', room: 'parlor' } }),
        you: you({ refute: { suggesterSeatId: '2', suggestion: { suspect: 'rook', weapon: 'vial', room: 'parlor' }, matching: ['rook', 'vial'] } }),
      }),
      ctx,
    );
    expect(vm.canRefute).toBe(true);
    expect(vm.status).toBe('Show Sleuth a card');
    expect(vm.tone).toBe('mine');
  });

  it('keeps an eliminated detective out of turns', () => {
    const base = snapshot();
    const vm = viewModel(snapshot({ seats: base.seats.map((s) => (s.seatId === '1' ? { ...s, eliminated: true } : s)) }), ctx);
    expect(vm.eliminated).toBe(true);
    expect(vm.canRoll).toBe(false);
    expect(vm.status).toBe('You are out of the running');
  });
});

describe('view model: outside a case', () => {
  it('shows a locked-table notice, with no board, to a member who arrives mid-case', () => {
    const base = snapshot();
    const vm = viewModel(snapshot({ you: null, positions: null, weapons: null, seats: base.seats.map((s) => ({ ...s, isLocal: false })) }), ctx);
    expect(vm.screen).toBe('notice');
    expect(vm.notice?.title).toBe('A case is under way — seats are locked');
  });

  it('closes the case with the winner, the solution, and New case for the host only', () => {
    const finished = snapshot({
      status: 'finished',
      winnerSeatId: '2',
      endReason: 'solved',
      solution: { suspect: 'duarte', weapon: 'bust', room: 'foyer' },
    });
    const host = viewModel(finished, ctx);
    expect(host.screen).toBe('finished');
    expect(host.won).toBe(false);
    expect(host.winnerName).toBe('Sleuth');
    expect(host.status).toBe('Sleuth solved the case');
    expect(host.canNewGame).toBe(true);
    const guest = viewModel({ ...finished, seats: finished.seats.map((s) => ({ ...s, isLocal: s.seatId === '2' })), you: you({ seatId: '2', suspect: 'finch' }) }, ctx);
    expect(guest.won).toBe(true);
    expect(guest.canNewGame).toBe(false);
    expect(endLine(true, 'solved', 'Sleuth')).toBe('You cracked the case.');
    expect(endLine(false, 'solved', 'Sleuth')).toBe('Sleuth solved the case.');
    expect(endLine(false, 'unsolved', null)).toBe('Every accusation was wrong. The case went cold.');
  });

  it('offers to clear a detective who has been away long enough', () => {
    const base = snapshot();
    const away = snapshot({
      seats: base.seats.map((s) => (s.seatId === '3' ? seat({ ...s, connected: false, awaySince: new Date(0).toISOString() }) : s)),
    });
    expect(viewModel(away, { ...ctx, serverNow: 10 * 60 * 1000 - 1 }).canClaimAbandoned).toBe(false);
    expect(viewModel(away, { ...ctx, serverNow: 10 * 60 * 1000 }).canClaimAbandoned).toBe(true);
  });
});
