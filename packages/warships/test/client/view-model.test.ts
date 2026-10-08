import { describe, expect, it } from 'vitest';
import type { TableSnapshot } from '../../src/protocol.js';
import { endLine, ownBoard, targetBoard, viewModel } from '../../src/client/view-model.js';
import { FLEET_A, FLEET_B, seat, snapshot } from './support.js';

const ctx = { serverNow: 10_000, resolving: false };

describe('view model: who is looking', () => {
  it('shows a member without a seat a full-table notice, or locked seats mid-game', () => {
    const spectator = (status: TableSnapshot['status']) =>
      snapshot({
        status,
        seats: [seat({ seatId: '1', isLocal: false }), seat({ seatId: '2', displayName: 'Captain', isLocal: false })],
        you: null,
        target: null,
      });
    const full = viewModel(spectator('finished'), null, ctx);
    expect(full.screen).toBe('notice');
    expect(full.notice?.title).toBe('This table is full');
    expect(viewModel(spectator('battle'), null, ctx).notice?.title).toBe('Game in progress — seats are locked');
    expect(viewModel(spectator('placing'), null, ctx).canFire).toBe(false);
  });

  it('is still joining until the snapshot names a local seat', () => {
    expect(viewModel(null, null, ctx).screen).toBe('connecting');
    expect(viewModel(null, null, { ...ctx, offline: true }).status).toBe('Reconnecting…');
    const open = snapshot({ status: 'waiting', seats: [seat({ isLocal: false }), seat({ seatId: '2', occupied: false, displayName: null, isLocal: false })], you: null, target: null });
    expect(viewModel(open, null, ctx).screen).toBe('connecting');
  });
});

describe('view model: phases', () => {
  it('waits for an opponent with a share prompt', () => {
    const vm = viewModel(
      snapshot({ status: 'waiting', seats: [seat(), seat({ seatId: '2', occupied: false, displayName: null, isLocal: false })], currentSeatId: null }),
      null,
      ctx,
    );
    expect(vm.screen).toBe('waiting');
    expect(vm.status).toBe('Waiting for an opponent — share the link');
  });

  it('shows the draft while placing, then the server’s fleet once ready, and lets you edit until both are ready', () => {
    const placing = (meReady: boolean, themReady: boolean) =>
      snapshot({
        status: 'placing',
        currentSeatId: null,
        seats: [seat({ ready: meReady }), seat({ seatId: '2', displayName: 'Captain', isLocal: false, ready: themReady })],
        you: { seatId: '1', fleet: meReady ? FLEET_A : null, ready: meReady, incoming: [] },
      });
    const drafting = viewModel(placing(false, true), FLEET_A.slice(0, 2), ctx);
    expect(drafting.status).toBe('Captain is ready — place your fleet');
    expect(drafting.own.ships.map((s) => s.placement.shipId)).toEqual(['carrier', 'battleship']);
    expect(drafting.canUnready).toBe(false);

    const waiting = viewModel(placing(true, false), null, ctx);
    expect(waiting.status).toBe('Fleet ready — waiting for Captain');
    expect(waiting.own.ships).toHaveLength(5);
    expect(waiting.canUnready).toBe(true);
    expect(viewModel(placing(true, true), null, ctx).canUnready).toBe(false);
  });

  it('only lets you fire on your open turn, and says why otherwise', () => {
    expect(viewModel(snapshot(), null, ctx)).toMatchObject({ screen: 'battle', myTurn: true, canFire: true, status: 'Your turn — choose a target', tone: 'mine' });

    const theirs = viewModel(snapshot({ currentSeatId: '2', turnNumber: 1 }), null, ctx);
    expect(theirs).toMatchObject({ canFire: false, status: 'Captain is targeting…', fireBlockedReason: "It is Captain's turn.", tone: 'theirs' });

    const opening = viewModel(snapshot({ turnOpensAt: 12_000 }), null, ctx);
    expect(opening).toMatchObject({ canFire: false, status: 'Battle stations — you fire first' });

    const reloading = viewModel(snapshot({ turnNumber: 3, turnOpensAt: 12_000 }), null, ctx);
    expect(reloading).toMatchObject({ canFire: false, status: 'Your turn — stand by…' });

    expect(viewModel(snapshot(), null, { ...ctx, resolving: true })).toMatchObject({ canFire: false, status: 'Resolving…' });
    expect(viewModel(snapshot(), null, { ...ctx, offline: true })).toMatchObject({ canFire: false, fireBlockedReason: 'Reconnecting…' });
  });

  it('offers a claim once the opponent has been away ten minutes', () => {
    const away = (minutes: number) =>
      snapshot({
        currentSeatId: '2',
        seats: [seat(), seat({ seatId: '2', displayName: 'Captain', isLocal: false, connected: false, awaySince: new Date(10_000 - minutes * 60_000).toISOString() })],
      });
    expect(viewModel(away(9), null, ctx).canClaimAbandoned).toBe(false);
    expect(viewModel(away(10), null, ctx).canClaimAbandoned).toBe(true);
    expect(viewModel(away(10), null, ctx).status).toBe('Captain is away — their turn is on hold');
  });

  it('ends with victory or defeat and a rematch while the opponent is here', () => {
    const over = (winner: '1' | '2', votes: Array<'1' | '2'> = []) =>
      snapshot({ status: 'finished', currentSeatId: null, winnerSeatId: winner, endReason: 'fleet_sunk', rematchVotes: votes });
    expect(viewModel(over('1'), null, ctx)).toMatchObject({ screen: 'finished', won: true, status: 'Victory', tone: 'win', canRematch: true });
    expect(viewModel(over('2', ['2']), null, ctx)).toMatchObject({ won: false, opponentRematchVoted: true, canRematch: true });
    expect(viewModel(over('2', ['1']), null, ctx)).toMatchObject({ rematchVoted: true, canRematch: false });
    expect(endLine(true, 'forfeit')).toBe('Your opponent struck their colours.');
    expect(endLine(false, 'fleet_sunk')).toBe('Your whole fleet was sunk.');
  });
});

describe('view model: what each board may show', () => {
  it('draws their ships only once sunk or revealed after the game', () => {
    const unsunkHit = targetBoard({ seatId: '2', shots: [{ row: 0, col: 5, result: 'hit', turnNumber: 1 }], sunk: [], revealed: null });
    expect(unsunkHit.ships).toEqual([]);
    expect(unsunkHit.cells[0]![5]).toMatchObject({ mark: 'hit', ship: null, label: 'A6, hit' });
    expect(unsunkHit.cells[0]![0]!.label).toBe('A1, unexplored');

    const sunk = { shipId: 'destroyer' as const, row: 0, col: 9, orientation: 'vertical' as const, length: 2, sunkOnTurn: 3 };
    const afterSink = targetBoard({
      seatId: '2',
      shots: [
        { row: 0, col: 9, result: 'hit', turnNumber: 1 },
        { row: 1, col: 9, result: 'hit', turnNumber: 3 },
        { row: 5, col: 0, result: 'miss', turnNumber: 2 },
      ],
      sunk: [sunk],
      revealed: null,
    });
    expect(afterSink.ships.map((s) => [s.placement.shipId, s.sunk, s.revealed])).toEqual([['destroyer', true, false]]);
    expect(afterSink.cells[1]![9]!.label).toBe('B10, hit, Destroyer sunk');
    expect(afterSink.cells[5]![0]!.label).toBe('F1, miss');
    expect(afterSink.hits).toBe(2);
    expect(afterSink.shots).toBe(3);

    const revealed = targetBoard({ seatId: '2', shots: [], sunk: [sunk], revealed: FLEET_B });
    expect(revealed.ships).toHaveLength(5);
    expect(revealed.ships.filter((s) => s.revealed).map((s) => s.placement.shipId)).toEqual(['carrier', 'battleship', 'cruiser', 'submarine']);
    expect(revealed.cells[0]![5]!.label).toBe('A6, unexplored, Carrier');
  });

  it('names your own ships and the shots against them', () => {
    const own = ownBoard(FLEET_A, [
      { row: 4, col: 0, result: 'hit', turnNumber: 2 },
      { row: 4, col: 1, result: 'hit', turnNumber: 4 },
      { row: 9, col: 9, result: 'miss', turnNumber: 6 },
    ]);
    expect(own.cells[0]![0]!.label).toBe('A1, Carrier');
    expect(own.cells[4]![1]!.label).toBe('E2, Destroyer, hit, sunk');
    expect(own.cells[9]![9]!.label).toBe('J10, open water, miss');
    expect(own.ships.find((s) => s.placement.shipId === 'destroyer')!.sunk).toBe(true);
  });

  it('never needs a hidden ship to render the target tracker', () => {
    const vm = viewModel(
      snapshot({ target: { seatId: '2', shots: [], sunk: [{ shipId: 'submarine', row: 0, col: 8, orientation: 'vertical', length: 3, sunkOnTurn: 5 }], revealed: null } }),
      null,
      ctx,
    );
    expect(vm.targetTracker.filter((c) => c.sunk).map((c) => c.shipId)).toEqual(['submarine']);
    expect(vm.target.ships.map((s) => s.placement.shipId)).toEqual(['submarine']);
  });
});
