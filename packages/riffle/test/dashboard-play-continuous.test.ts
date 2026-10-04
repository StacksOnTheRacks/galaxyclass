// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { startDashboardPlay, type DashboardPlaySession } from '../src/client/dashboard-play/session.js';
import { AWAY_GRACE_MS } from '../src/runtime/reap.js';
import type { TableSnapshotMessage } from '../src/runtime/types.js';
import { configFetch, type FakePlaySocket, flush, memoryStorage, setViewport } from './support/fake-play-socket.js';
import { RuntimeBridge } from './support/runtime-bridge.js';

const TABLE_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

interface Player {
  root: HTMLElement;
  session: DashboardPlaySession;
  storage: ReturnType<typeof memoryStorage>;
  sockets: FakePlaySocket[];
  navigations: string[];
}

describe('continuous play on one table', () => {
  let bridge: RuntimeBridge;

  beforeEach(async () => {
    document.body.replaceChildren();
    setViewport(1440);
    // Deal the next hand as soon as one ends.
    bridge = new RuntimeBridge(42, 0);
    await bridge.store.createTable(TABLE_ID, '2026-09-25T12:00:00.000Z');
  });

  async function settle(): Promise<void> {
    for (let round = 0; round < 3; round += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await bridge.settle();
      await flush();
    }
  }

  async function openPlayer(storage = memoryStorage()): Promise<Player> {
    const root = document.createElement('main');
    document.body.append(root);
    const sockets: FakePlaySocket[] = [];
    const navigations: string[] = [];
    const session = await startDashboardPlay({
      root,
      pathname: `/${TABLE_ID}`,
      fetch: configFetch().fetchImpl,
      storage,
      reconnectDelayMs: 0,
      assignLocation: (url) => navigations.push(url),
      createSocket: (url) => {
        const socket = bridge.createSocket(url);
        sockets.push(socket);
        return socket;
      },
    });
    await settle();
    return { root, session, storage, sockets, navigations };
  }

  function button(player: Player, field: string): HTMLButtonElement | null {
    return player.root.querySelector<HTMLButtonElement>(`[data-field="${field}"]`);
  }

  function statusText(player: Player): string {
    return player.root.querySelector('[data-region="actions"]')?.textContent ?? '';
  }

  async function click(player: Player, field: string): Promise<void> {
    const target = button(player, field);
    expect(target, `${field} should render`).not.toBeNull();
    expect(target!.disabled).toBe(false);
    target!.click();
    await settle();
  }

  function snapshotsSeen(player: Player): TableSnapshotMessage[] {
    return player.sockets
      .flatMap((socket) => socket.received)
      .filter((message): message is TableSnapshotMessage => (message as { type?: string }).type === 'table_snapshot');
  }

  /** Plays the current hand out and returns the finished-hand snapshot the first player saw. */
  async function playHand(players: Player[], action: 'fold' | 'passive'): Promise<TableSnapshotMessage> {
    const handNumber = players[0]!.session.snapshot!.handNumber;
    for (let step = 0; step < 40; step += 1) {
      const current = players[0]!.session.snapshot!;
      if (current.handNumber !== handNumber || current.status !== 'hand_in_progress' || current.phase === 'complete') {
        const finished = snapshotsSeen(players[0]!).find(
          (row) => row.handNumber === handNumber && row.phase === 'complete',
        );
        expect(finished, 'the finished hand should be shown').toBeDefined();
        return finished!;
      }
      const actor = players.find(({ root }) => root.querySelector('[data-field="action-controls"]'));
      expect(actor, `someone should be acting at step ${step}`).toBeDefined();
      const root = actor!.root;
      const button = (name: string) => root.querySelector<HTMLButtonElement>(`[data-action="${name}"]`);
      const choice =
        action === 'fold' ? (button('fold') ?? button('check')) : (button('check') ?? button('call'));
      choice!.click();
      await settle();
    }
    throw new Error('hand did not complete');
  }

  function totalChips(player: Player): number {
    const snapshot = player.session.snapshot!;
    return snapshot.seats.reduce((sum, seat) => sum + seat.stack, 0) + snapshot.pot;
  }

  it('seats each arrival at the first open seat with a random name and deals when the second sits', async () => {
    const alice = await openPlayer();
    expect(alice.session.seatId).toBe('1');
    expect(alice.session.snapshot!.status).toBe('open');
    expect(statusText(alice)).toContain('Waiting for another player to sit.');
    expect(alice.root.querySelector('[data-field="sit-panel"]')).toBeNull();

    const bob = await openPlayer();
    expect(bob.session.seatId).toBe('2');
    const names = bob.session.snapshot!.seats.map((seat) => seat.displayName);
    expect(new Set(names).size).toBe(2);
    for (const name of names) {
      expect(name.length).toBeGreaterThanOrEqual(3);
      expect(name.length).toBeLessThanOrEqual(24);
    }
    expect(alice.session.snapshot!.status).toBe('hand_in_progress');
    expect(alice.session.snapshot!.pocketCards).toHaveLength(2);
    expect(bob.session.snapshot!.pocketCards).toHaveLength(2);
    expect(button(alice, 'deal-hand')).toBeNull();
  });

  it('deals the next hand automatically after each hand and rotates the button', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();
    const firstButton = alice.session.snapshot!.buttonSeatId;

    const first = await playHand([alice, bob], 'fold');
    expect(first.completeReason).toBe('fold_to_one');
    expect(first.seats.some((seat) => (seat.wonAmount ?? 0) > 0)).toBe(true);

    const second = alice.session.snapshot!;
    expect(second.handNumber).toBe(2);
    expect(second.phase).toBe('betting');
    expect(second.buttonSeatId).not.toBe(firstButton);
    expect(second.pocketCards).toHaveLength(2);

    const showdown = await playHand([alice, bob], 'passive');
    expect(showdown.completeReason).toBe('showdown');
    expect(showdown.seats.filter((seat) => seat.holeCards?.length === 2).length).toBe(2);
    expect(alice.session.snapshot!.handNumber).toBe(3);
    expect(totalChips(alice)).toBe(4000);
  });

  it('seats a mid-hand arrival to wait, then deals them into the next hand', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();
    const carol = await openPlayer();

    expect(carol.session.seatId).toBe('3');
    expect(carol.session.snapshot!.pocketCards).toBeUndefined();
    expect(carol.root.querySelector('[data-field="action-controls"]')).toBeNull();
    expect(statusText(carol)).toContain('Waiting for the next hand');
    expect(alice.root.querySelector('[data-region="player-row"]')?.textContent).toContain('Next hand');

    await playHand([alice, bob], 'fold');
    const dealt = await bridge.store.listSeats(TABLE_ID);
    expect(dealt.filter((seat) => seat.hole)).toHaveLength(3);
    expect(carol.session.snapshot!.pocketCards).toHaveLength(2);
  });

  it('does not offer Leave seat once you are at the table', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();
    expect(button(alice, 'leave-seat')).toBeNull();
    expect(button(bob, 'leave-seat')).toBeNull();
    expect(button(alice, 'leave-table')).not.toBeNull();
    expect(button(bob, 'leave-table')).not.toBeNull();
  });

  it('skips a busted seat when dealing the next hand', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();
    await openPlayer();

    const carolSeat = (await bridge.store.getSeat(TABLE_ID, '3'))!;
    await bridge.store.putSeat(TABLE_ID, { ...carolSeat, stack: 0 });

    await playHand([alice, bob], 'fold');
    const seats = await bridge.store.listSeats(TABLE_ID);
    expect(seats.find((seat) => seat.seatId === '3')?.hole).toBeUndefined();
    expect(seats.filter((seat) => seat.hole)).toHaveLength(2);
  });

  it('marks a dropped player away and lets the same tab reclaim the seat after refresh', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();
    expect(alice.storage.items.size).toBe(1);

    alice.session.dispose();
    alice.root.remove();
    bridge.drop(alice.sockets.at(-1)!);
    await settle();

    const bobView = bob.session.snapshot!.seats.find((seat) => seat.seatId === '1')!;
    expect(bobView.away).toBe(true);
    expect(bob.root.querySelector('[data-region="player-row"]')?.textContent).toContain('Away');

    const refreshed = await openPlayer(alice.storage);
    expect(refreshed.sockets.at(-1)!.actions()).toEqual(['join_table', 'resume_seat']);
    expect(refreshed.session.hasSeatToken()).toBe(true);
    expect(refreshed.session.seatId).toBe('1');
    expect(refreshed.session.snapshot!.seats.find((seat) => seat.isLocal)?.seatId).toBe('1');
    expect(bob.session.snapshot!.seats.find((seat) => seat.seatId === '1')?.away).toBeUndefined();
    expect(totalChips(refreshed)).toBe(4000);
  });

  it('reconnects automatically after the socket drops and keeps the seat', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();

    bridge.drop(alice.sockets[0]!);
    await settle();

    expect(alice.sockets).toHaveLength(2);
    expect(alice.session.phase).toBe('joined');
    expect(alice.session.reconnecting).toBe(false);
    expect(alice.session.snapshot!.seats.find((seat) => seat.isLocal)?.seatId).toBe('1');
    expect(bob.session.snapshot!.status).toBe('hand_in_progress');
  });

  it('auto-folds a dropped player on their turn, then waits for another player', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();

    const players = [alice, bob];
    const acting = players.find(({ root }) => root.querySelector('[data-field="action-controls"]'))!;
    const other = players.find((player) => player !== acting)!;
    const handNumber = other.session.snapshot!.handNumber;
    acting.session.dispose();
    bridge.drop(acting.sockets[0]!);
    await settle();

    const finished = snapshotsSeen(other).find((row) => row.handNumber === handNumber && row.phase === 'complete');
    expect(finished?.completeReason).toBe('fold_to_one');
    expect(finished?.seats.find((seat) => seat.isLocal)?.wonAmount).toBeGreaterThan(0);
    expect(other.session.snapshot!.status).toBe('open');
    expect(statusText(other)).toContain('Waiting for another player to sit.');
  });

  it('auto-folds a dropped player when the action reaches them', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();
    const carol = await openPlayer();
    await playHand([alice, bob], 'fold');

    const players = [alice, bob, carol];
    const acting = players.find(({ root }) => root.querySelector('[data-field="action-controls"]'))!;
    const actingSeat = Number(acting.session.seatId);
    const nextSeat = String((actingSeat % 3) + 1);
    const next = players.find((player) => player.session.seatId === nextSeat)!;

    next.session.dispose();
    bridge.drop(next.sockets[0]!);
    await settle();
    expect(acting.root.querySelector('[data-action="call"]')).not.toBeNull();

    acting.root.querySelector<HTMLButtonElement>('[data-action="call"]')!.click();
    await settle();

    const seats = await bridge.store.listSeats(TABLE_ID);
    expect(seats.find((seat) => seat.seatId === nextSeat)?.folded).toBe(true);
    const table = await bridge.store.getTable(TABLE_ID);
    expect(table?.currentSeatId).not.toBe(nextSeat);
  });

  it('frees a seat that stays away past the grace period for the next arrival', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();
    const bobName = bob.session.snapshot!.seats.find((seat) => seat.isLocal)!.displayName;
    bob.session.dispose();
    bridge.drop(bob.sockets[0]!);
    await settle();
    await playHand([alice], 'fold').catch(() => undefined);
    // Bob is away and folded out; with one player left the table waits.
    expect(alice.session.snapshot!.status).toBe('open');
    expect(alice.session.snapshot!.seats.find((seat) => seat.seatId === '2')?.away).toBe(true);

    bridge.nowMs += AWAY_GRACE_MS;
    const dave = await openPlayer();
    expect(dave.session.seatId).toBe('2');
    expect((await bridge.store.getSeat(TABLE_ID, '2'))?.displayName).not.toBe(bobName);
    expect(alice.session.snapshot!.seats.map((seat) => seat.seatId)).toEqual(['1', '2']);
    expect(alice.session.snapshot!.status).toBe('hand_in_progress');
  });

  it('Leave table mid-hand returns to the table list and frees the seat after the hand', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();
    const carol = await openPlayer();
    await playHand([alice, bob], 'fold');

    await click(bob, 'leave-table');
    expect(bob.session.hasSeatToken()).toBe(false);
    expect(bob.storage.items.size).toBe(0);
    expect(bob.navigations).toEqual(['/']);
    expect(alice.session.snapshot!.seats.find((seat) => seat.seatId === '2')?.away).toBe(true);

    await playHand([alice, carol], 'fold');
    expect(await bridge.store.getSeat(TABLE_ID, '2')).toBeNull();
    expect(alice.session.snapshot!.seats.map((seat) => seat.seatId)).toEqual(['1', '3']);
    expect(alice.session.snapshot!.handNumber).toBe(3);
  });

  it('shows Leave table while waiting on another player mid-hand', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();

    const waiting = [alice, bob].find(({ root }) => !root.querySelector('[data-field="action-controls"]'))!;
    expect(button(waiting, 'leave-seat')).toBeNull();
    expect(button(waiting, 'leave-table')).not.toBeNull();
  });
});
