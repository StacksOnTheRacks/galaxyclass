// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { startDashboardPlay, type DashboardPlaySession } from '../src/client/dashboard-play/session.js';
import { AWAY_GRACE_MS } from '../src/runtime/reap.js';
import { configFetch, type FakePlaySocket, flush, memoryStorage, setViewport } from './support/fake-play-socket.js';
import { RuntimeBridge } from './support/runtime-bridge.js';

const TABLE_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

interface Player {
  root: HTMLElement;
  session: DashboardPlaySession;
  storage: ReturnType<typeof memoryStorage>;
  sockets: FakePlaySocket[];
}

describe('continuous play on one table', () => {
  let bridge: RuntimeBridge;

  beforeEach(async () => {
    document.body.replaceChildren();
    setViewport(1440);
    bridge = new RuntimeBridge();
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
    const session = await startDashboardPlay({
      root,
      pathname: `/${TABLE_ID}`,
      fetch: configFetch().fetchImpl,
      storage,
      reconnectDelayMs: 0,
      createSocket: (url) => {
        const socket = bridge.createSocket(url);
        sockets.push(socket);
        return socket;
      },
    });
    await settle();
    return { root, session, storage, sockets };
  }

  async function sit(player: Player, seatId: string, name: string): Promise<void> {
    const radio = player.root.querySelector<HTMLInputElement>(`input[name="seatId"][value="${seatId}"]`)!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    const input = player.root.querySelector<HTMLInputElement>('#sit-display-name')!;
    input.value = name;
    input.dispatchEvent(new Event('input'));
    player.root.querySelector<HTMLButtonElement>('.sit-panel-submit')!.click();
    await settle();
  }

  function button(player: Player, field: string): HTMLButtonElement | null {
    return player.root.querySelector<HTMLButtonElement>(`[data-field="${field}"]`);
  }

  async function click(player: Player, field: string): Promise<void> {
    const target = button(player, field);
    expect(target, `${field} should render`).not.toBeNull();
    expect(target!.disabled).toBe(false);
    target!.click();
    await settle();
  }

  async function playToCompletion(players: Player[], action: 'fold' | 'passive'): Promise<void> {
    for (let step = 0; step < 40; step += 1) {
      if (players[0]!.session.snapshot?.phase === 'complete') {
        return;
      }
      const actor = players.find(({ root }) => root.querySelector('[data-action="fold"]'));
      expect(actor, `someone should be acting at step ${step}`).toBeDefined();
      const root = actor!.root;
      const check = root.querySelector<HTMLButtonElement>('[data-action="check"]')!;
      const choice =
        action === 'fold'
          ? root.querySelector<HTMLButtonElement>('[data-action="fold"]')!
          : check.disabled
            ? root.querySelector<HTMLButtonElement>('[data-action="call"]')!
            : check;
      choice.click();
      await settle();
    }
    throw new Error('hand did not complete');
  }

  function totalChips(player: Player): number {
    return player.session.snapshot!.seats.reduce((sum, seat) => sum + seat.stack, 0);
  }

  it('deals a second hand after the first completes and rotates the button', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();
    await sit(alice, '1', 'Alice');
    await sit(bob, '2', 'Bob');

    await click(alice, 'deal-hand');
    const firstButton = alice.session.snapshot!.buttonSeatId;
    await playToCompletion([alice, bob], 'fold');

    expect(alice.session.snapshot!.phase).toBe('complete');
    expect(button(alice, 'hand-summary')?.textContent).toMatch(/Hand complete · (Alice|Bob) wins/);
    expect(button(bob, 'deal-hand')?.textContent).toBe('Deal next hand');

    await click(bob, 'deal-hand');
    const second = alice.session.snapshot!;
    expect(second.handNumber).toBe(2);
    expect(second.phase).toBe('betting');
    expect(second.buttonSeatId).not.toBe(firstButton);
    expect(second.pocketCards).toHaveLength(2);

    await playToCompletion([alice, bob], 'passive');
    expect(alice.session.snapshot!.phase).toBe('complete');
    expect(alice.session.snapshot!.completeReason).toBe('showdown');
    expect(totalChips(alice)).toBe(4000);

    await click(alice, 'deal-hand');
    expect(alice.session.snapshot!.handNumber).toBe(3);
  });

  it('lets a new player sit and an existing player leave between hands', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();
    await sit(alice, '1', 'Alice');
    await sit(bob, '2', 'Bob');
    await click(alice, 'deal-hand');
    await playToCompletion([alice, bob], 'fold');

    const carol = await openPlayer();
    await sit(carol, '3', 'Carol');
    expect(carol.session.hasSeatToken()).toBe(true);
    expect(carol.session.snapshot!.seats.map((seat) => seat.seatId)).toEqual(['1', '2', '3']);

    await click(carol, 'deal-hand');
    const dealt = await bridge.store.listSeats(TABLE_ID);
    expect(dealt.filter((seat) => seat.hole)).toHaveLength(3);

    await playToCompletion([alice, bob, carol], 'fold');
    await click(bob, 'leave-seat');
    expect(bob.session.hasSeatToken()).toBe(false);
    expect(bob.storage.items.size).toBe(0);
    expect(bob.root.querySelector('.sit-panel-submit')).not.toBeNull();
    expect(alice.session.snapshot!.seats.map((seat) => seat.seatId)).toEqual(['1', '3']);
  });

  it('skips a busted seat when dealing the next hand', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();
    const carol = await openPlayer();
    await sit(alice, '1', 'Alice');
    await sit(bob, '2', 'Bob');
    await sit(carol, '3', 'Carol');

    const bobSeat = (await bridge.store.getSeat(TABLE_ID, '2'))!;
    await bridge.store.putSeat(TABLE_ID, { ...bobSeat, stack: 0 });

    await click(alice, 'deal-hand');
    const seats = await bridge.store.listSeats(TABLE_ID);
    expect(seats.find((seat) => seat.seatId === '2')?.hole).toBeUndefined();
    expect(seats.filter((seat) => seat.hole)).toHaveLength(2);
  });

  it('marks a dropped player away and lets the same tab reclaim the seat after refresh', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();
    await sit(alice, '1', 'Alice');
    await sit(bob, '2', 'Bob');
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
    const local = refreshed.session.snapshot!.seats.find((seat) => seat.isLocal);
    expect(local?.seatId).toBe('1');
    expect(local?.stack).toBe(2000);
    expect(bob.session.snapshot!.seats.find((seat) => seat.seatId === '1')?.away).toBeUndefined();
    expect(button(refreshed, 'deal-hand')).not.toBeNull();
  });

  it('reconnects automatically after the socket drops and keeps the seat', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();
    await sit(alice, '1', 'Alice');
    await sit(bob, '2', 'Bob');

    bridge.drop(alice.sockets[0]!);
    await settle();

    expect(alice.sockets).toHaveLength(2);
    expect(alice.session.phase).toBe('joined');
    expect(alice.session.reconnecting).toBe(false);
    expect(alice.session.snapshot!.seats.find((seat) => seat.isLocal)?.seatId).toBe('1');
    await click(alice, 'deal-hand');
    expect(bob.session.snapshot!.status).toBe('hand_in_progress');
  });

  it('auto-folds a dropped player when it is their turn so the hand completes', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();
    await sit(alice, '1', 'Alice');
    await sit(bob, '2', 'Bob');
    await click(alice, 'deal-hand');

    const players = [alice, bob];
    const acting = players.find(({ root }) => root.querySelector('[data-action="fold"]'))!;
    const other = players.find((player) => player !== acting)!;
    acting.session.dispose();
    bridge.drop(acting.sockets[0]!);
    await settle();

    const final = other.session.snapshot!;
    expect(final.phase).toBe('complete');
    expect(final.completeReason).toBe('fold_to_one');
    expect(final.seats.find((seat) => seat.isLocal)?.wonAmount).toBeGreaterThan(0);
    expect(button(other, 'deal-hand')?.disabled).toBe(true);
  });

  it('auto-folds a dropped player when the action reaches them', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();
    const carol = await openPlayer();
    await sit(alice, '1', 'Alice');
    await sit(bob, '2', 'Bob');
    await sit(carol, '3', 'Carol');
    await click(alice, 'deal-hand');

    const players = [alice, bob, carol];
    const acting = players.find(({ root }) => root.querySelector('[data-action="fold"]'))!;
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

  it('removes a seat that stays away past the grace period once someone else joins', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();
    await sit(alice, '1', 'Alice');
    await sit(bob, '2', 'Bob');
    bob.session.dispose();
    bridge.drop(bob.sockets[0]!);
    await settle();
    expect(alice.session.snapshot!.seats.find((seat) => seat.seatId === '2')?.away).toBe(true);

    bridge.nowMs += AWAY_GRACE_MS - 1;
    await openPlayer();
    expect(await bridge.store.getSeat(TABLE_ID, '2')).not.toBeNull();

    bridge.nowMs += 1;
    await openPlayer();
    expect(await bridge.store.getSeat(TABLE_ID, '2')).toBeNull();
    expect(alice.session.snapshot!.seats.map((seat) => seat.seatId)).toEqual(['1']);
    expect(alice.session.snapshot!.seatedPlayersLabel).toBe('1 / 8');
  });

  it('Leave table mid-hand detaches the player now and frees the seat after the hand', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();
    const carol = await openPlayer();
    await sit(alice, '1', 'Alice');
    await sit(bob, '2', 'Bob');
    await sit(carol, '3', 'Carol');
    await click(alice, 'deal-hand');

    await click(bob, 'leave-table');
    expect(bob.session.hasSeatToken()).toBe(false);
    expect(bob.storage.items.size).toBe(0);
    expect(button(bob, 'leave-table')).toBeNull();
    expect(alice.session.snapshot!.seats.find((seat) => seat.seatId === '2')?.away).toBe(true);

    await playToCompletion([alice, carol], 'fold');
    expect((await bridge.store.getSeat(TABLE_ID, '2'))?.folded).toBe(true);

    await click(alice, 'deal-hand');
    expect(await bridge.store.getSeat(TABLE_ID, '2')).toBeNull();
    expect(alice.session.snapshot!.seats.map((seat) => seat.seatId)).toEqual(['1', '3']);
    expect(alice.session.snapshot!.handNumber).toBe(2);
  });

  it('shows Leave seat while waiting on another player mid-hand', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();
    await sit(alice, '1', 'Alice');
    await sit(bob, '2', 'Bob');
    await click(alice, 'deal-hand');

    const waiting = [alice, bob].find(({ root }) => !root.querySelector('[data-action="fold"]'))!;
    expect(button(waiting, 'leave-seat')).not.toBeNull();
  });

  it('lets a new player take an away seat between hands', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();
    await sit(alice, '1', 'Alice');
    await sit(bob, '2', 'Bob');
    bob.session.dispose();
    bridge.drop(bob.sockets[0]!);
    await settle();

    const dave = await openPlayer();
    const awaySeat = dave.root.querySelector<HTMLInputElement>('input[name="seatId"][value="2"]')!;
    expect(awaySeat.disabled).toBe(false);
    expect(dave.root.querySelector<HTMLInputElement>('input[name="seatId"][value="3"]')!.checked).toBe(true);
    await sit(dave, '2', 'Dave');

    expect(dave.session.seatId).toBe('2');
    expect((await bridge.store.getSeat(TABLE_ID, '2'))?.displayName).toBe('Dave');

    const bobReturns = await openPlayer(bob.storage);
    expect(bobReturns.session.hasSeatToken()).toBe(false);
    expect(bobReturns.storage.items.size).toBe(0);
    expect(bobReturns.root.querySelector('.sit-panel-submit')).not.toBeNull();
  });
});
