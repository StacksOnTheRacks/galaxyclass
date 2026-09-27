// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { startDashboardPlay, type DashboardPlaySession } from '../src/client/dashboard-play/session.js';
import type { TableSnapshotMessage } from '../src/runtime/types.js';
import { configFetch, FakePlaySocket, flush, memoryStorage, setViewport } from './support/fake-play-socket.js';
import { RuntimeBridge } from './support/runtime-bridge.js';

const TABLE_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

function snapshot(overrides: Partial<TableSnapshotMessage> = {}): TableSnapshotMessage {
  return {
    type: 'table_snapshot',
    tableId: TABLE_ID,
    version: 2,
    status: 'open',
    createdAt: '2026-09-25T12:00:00.000Z',
    handNumber: null,
    street: null,
    blindsLabel: '$1 / $2',
    seatedPlayersLabel: '0 / 8',
    pot: 0,
    buttonSeatId: null,
    currentSeatId: null,
    seats: [],
    ...overrides,
  };
}

function addRoot(): HTMLElement {
  const root = document.createElement('main');
  document.body.append(root);
  return root;
}

async function joinWithFakeSocket() {
  const root = addRoot();
  let socket!: FakePlaySocket;
  const session = await startDashboardPlay({
    root,
    pathname: `/${TABLE_ID}`,
    fetch: configFetch().fetchImpl,
    storage: memoryStorage(),
    createSocket: (url) => {
      socket = new FakePlaySocket(url);
      return socket;
    },
  });
  socket.emit('open');
  socket.receive(snapshot({ seats: [{ seatId: '1', displayName: 'Alice', isLocal: false, stack: 2000, inHand: false, committed: 0, position: null, acting: false, folded: false }], seatedPlayersLabel: '1 / 8' }));
  return { root, socket, session };
}

function sitForm(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>('[data-field="sit-panel"]')!;
  const input = root.querySelector<HTMLInputElement>('#sit-display-name')!;
  const submit = root.querySelector<HTMLButtonElement>('.sit-panel-submit')!;
  const status = root.querySelector<HTMLElement>('.sit-panel-status')!;
  const error = root.querySelector<HTMLElement>('.sit-panel-error')!;
  return { form, input, submit, status, error };
}

function typeName(root: HTMLElement, value: string): void {
  const { input } = sitForm(root);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function pickSeat(root: HTMLElement, seatId: string): void {
  const radio = root.querySelector<HTMLInputElement>(`input[name="seatId"][value="${seatId}"]`)!;
  radio.checked = true;
  radio.dispatchEvent(new Event('change'));
}

function clickSit(root: HTMLElement): void {
  sitForm(root).submit.click();
}

describe('dashboard play sit with display name', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    setViewport(1440);
  });

  it('shows an unseated Pick a seat panel with open seats, a labeled name field, and Sit at Table', async () => {
    const { root } = await joinWithFakeSocket();
    const { input, submit } = sitForm(root);

    expect(root.textContent).toContain('Pick a seat');
    expect(submit.textContent).toBe('Sit at Table');
    const label = root.querySelector('label[for="sit-display-name"]');
    expect(label?.textContent).toBe('Display name');
    expect(input.id).toBe('sit-display-name');

    const seat1 = root.querySelector<HTMLInputElement>('input[name="seatId"][value="1"]')!;
    const seat2 = root.querySelector<HTMLInputElement>('input[name="seatId"][value="2"]')!;
    expect(seat1.disabled).toBe(true);
    expect(seat2.disabled).toBe(false);
    expect(seat2.checked).toBe(true);
    expect(root.querySelectorAll('input[name="seatId"]')).toHaveLength(8);
    expect(root.textContent).not.toMatch(/Sign in|Create account|Mic|Camera/);
  });

  it.each(['', '   ', 'Al', '  Al  ', 'x'.repeat(25), `  ${'y'.repeat(25)} `])(
    'does not send sit for %j and shows the 3–24 message as text',
    async (name) => {
      const { root, socket } = await joinWithFakeSocket();
      typeName(root, name);
      clickSit(root);

      expect(socket.actions()).toEqual(['join_table']);
      const { error, input } = sitForm(root);
      expect(error.hidden).toBe(false);
      expect(error.getAttribute('role')).toBe('alert');
      expect(error.textContent).toBe('Name must be 3–24 characters.');
      expect(input.getAttribute('aria-invalid')).toBe('true');
    },
  );

  it('sends seat id plus trimmed display name, then announces Taking your seat… with controls disabled', async () => {
    const { root, socket } = await joinWithFakeSocket();
    pickSeat(root, '3');
    typeName(root, '  Bob  ');
    clickSit(root);

    expect(socket.sent.at(-1)).toEqual({ action: 'sit', seatId: '3', displayName: 'Bob' });
    expect(Object.keys(socket.sent.at(-1)!)).not.toContain('stack');

    const { status, submit, input } = sitForm(root);
    expect(status.textContent).toBe('Taking your seat…');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(submit.disabled).toBe(true);
    expect(input.disabled).toBe(true);
    expect(root.querySelector<HTMLFieldSetElement>('.sit-panel-seats')!.disabled).toBe(true);

    clickSit(root);
    expect(socket.actions().filter((action) => action === 'sit')).toHaveLength(1);
  });

  it('keeps the typed name when another player sits while unseated', async () => {
    const { root, socket } = await joinWithFakeSocket();
    typeName(root, 'Carol');
    socket.receive(snapshot({ seatedPlayersLabel: '2 / 8', seats: [
      { seatId: '1', displayName: 'Alice', isLocal: false, stack: 2000, inHand: false, committed: 0, position: null, acting: false, folded: false },
      { seatId: '2', displayName: 'Dave', isLocal: false, stack: 2000, inHand: false, committed: 0, position: null, acting: false, folded: false },
    ] }));

    expect(sitForm(root).input.value).toBe('Carol');
    expect(root.querySelector<HTMLInputElement>('input[name="seatId"][value="2"]')!.disabled).toBe(true);
    expect(root.querySelector<HTMLInputElement>('input[name="seatId"][value="3"]')!.checked).toBe(true);
  });

  it('returns to the sit panel with a notice when the seat was taken', async () => {
    const { root, socket } = await joinWithFakeSocket();
    typeName(root, 'Bob');
    clickSit(root);
    socket.receive({ type: 'error', code: 'seat_occupied' });

    const { status, submit } = sitForm(root);
    expect(submit.disabled).toBe(false);
    expect(status.textContent).toContain('That seat was just taken');
    expect(root.dataset.surface).toBe('dashboard');
  });

  it('keeps the seat token and sends it on start_hand and betting actions', async () => {
    const { root, socket, session } = await joinWithFakeSocket();
    typeName(root, 'Bob');
    clickSit(root);
    socket.receive({ type: 'sat', seatId: '2', seatToken: 'token-abc' });
    expect(session.hasSeatToken()).toBe(true);

    const seats = [
      { seatId: '1', displayName: 'Alice', isLocal: false, stack: 2000, inHand: false, committed: 0, position: null, acting: false, folded: false },
      { seatId: '2', displayName: 'Bob', isLocal: true, stack: 2000, inHand: false, committed: 0, position: null, acting: false, folded: false },
    ];
    socket.receive(snapshot({ seatedPlayersLabel: '2 / 8', seats }));

    root.querySelector<HTMLButtonElement>('[data-field="deal-hand"]')!.click();
    expect(socket.sent.at(-1)).toEqual({ action: 'start_hand', seatToken: 'token-abc' });

    socket.receive(snapshot({
      status: 'hand_in_progress',
      phase: 'betting',
      street: 'preflop',
      handNumber: 1,
      pot: 3,
      toCall: 1,
      currentBet: 2,
      minRaiseTo: 4,
      pocketCards: ['Ah', 'Kd'],
      seatedPlayersLabel: '2 / 8',
      seats: [
        { ...seats[0]!, inHand: true, committed: 2, position: 'BB', stack: 1998 },
        { ...seats[1]!, inHand: true, committed: 1, position: 'SB', stack: 1999, acting: true },
      ],
    }));

    const call = root.querySelector<HTMLButtonElement>('[data-action="call"]')!;
    expect(call.textContent).toContain('Call');
    call.click();
    expect(socket.sent.at(-1)).toEqual({ action: 'call', seatToken: 'token-abc' });
    expect(JSON.stringify(socket.sent)).not.toContain('create_table');
  });
});

describe('two anonymous players complete a hand through the runtime', () => {
  let bridge: RuntimeBridge;

  beforeEach(async () => {
    document.body.replaceChildren();
    setViewport(1440);
    bridge = new RuntimeBridge();
    await bridge.store.createTable(TABLE_ID, '2026-09-25T12:00:00.000Z');
  });

  async function openPlayer(): Promise<{ root: HTMLElement; session: DashboardPlaySession }> {
    const root = addRoot();
    const session = await startDashboardPlay({
      root,
      pathname: `/${TABLE_ID}`,
      fetch: configFetch().fetchImpl,
      storage: memoryStorage(),
      createSocket: bridge.createSocket,
    });
    await bridge.settle();
    return { root, session };
  }

  async function sit(root: HTMLElement, seatId: string, name: string): Promise<void> {
    pickSeat(root, seatId);
    typeName(root, name);
    clickSit(root);
    expect(sitForm(root).status.textContent).toBe('Taking your seat…');
    await bridge.settle();
    await flush();
  }

  function localTile(root: HTMLElement): string {
    return root.querySelector('[data-region="player-row"]')?.textContent ?? '';
  }

  async function playToCompletion(
    players: Array<{ root: HTMLElement; session: DashboardPlaySession }>,
    choose: (root: HTMLElement) => HTMLButtonElement,
  ): Promise<void> {
    for (let step = 0; step < 40; step += 1) {
      const phase = players[0]!.session.snapshot?.phase;
      if (phase === 'complete') {
        return;
      }
      const actor = players.find(({ root }) => root.querySelector('[data-action="fold"]'));
      expect(actor, `someone should be acting at step ${step}`).toBeDefined();
      choose(actor!.root).click();
      await bridge.settle();
      await flush();
    }
    throw new Error('hand did not complete');
  }

  it('goes unseated → sit → Your Turn and plays check/call to showdown with play chips', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();

    await sit(alice.root, '1', 'Alice');
    await sit(bob.root, '2', '  Bob Loblaw ');

    expect(alice.session.hasSeatToken()).toBe(true);
    expect(bob.session.hasSeatToken()).toBe(true);
    expect((await bridge.store.getSeat(TABLE_ID, '1'))?.stack).toBe(2000);
    expect((await bridge.store.getSeat(TABLE_ID, '2'))?.displayName).toBe('Bob Loblaw');
    expect(localTile(alice.root)).toContain('Bob Loblaw');
    expect(
      bob.root.querySelector('[data-local="true"] [data-field="avatar"]')?.getAttribute('src'),
    ).toMatch(/^\/assets\/avatars\/\d+\.webp$/);
    expect(bob.root.querySelector('[data-region="my-hand"]')?.textContent).toContain('2,000');

    const deal = alice.root.querySelector<HTMLButtonElement>('[data-field="deal-hand"]')!;
    expect(deal.disabled).toBe(false);
    deal.click();
    await bridge.settle();
    await flush();

    expect(alice.session.snapshot?.status).toBe('hand_in_progress');
    expect(alice.session.snapshot?.pocketCards).toHaveLength(2);
    expect(bob.session.snapshot?.pocketCards).toHaveLength(2);
    expect(alice.session.snapshot?.pocketCards).not.toEqual(bob.session.snapshot?.pocketCards);

    await playToCompletion([alice, bob], (root) => {
      const check = root.querySelector<HTMLButtonElement>('[data-action="check"]')!;
      return check.disabled ? root.querySelector<HTMLButtonElement>('[data-action="call"]')! : check;
    });

    const final = alice.session.snapshot!;
    expect(final.phase).toBe('complete');
    expect(final.completeReason).toBe('showdown');
    expect(final.board).toHaveLength(5);
    expect(final.seats.reduce((sum, seat) => sum + seat.stack, 0)).toBe(4000);
    expect(final.seats.some((seat) => (seat.wonAmount ?? 0) > 0)).toBe(true);
    expect(alice.root.textContent).toContain('Hand complete');
  });

  it('completes a hand by fold-out', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();
    await sit(alice.root, '1', 'Alice');
    await sit(bob.root, '2', 'Bob');

    bob.root.querySelector<HTMLButtonElement>('[data-field="deal-hand"]')!.click();
    await bridge.settle();
    await flush();

    await playToCompletion([alice, bob], (root) =>
      root.querySelector<HTMLButtonElement>('[data-action="fold"]')!,
    );

    const final = bob.session.snapshot!;
    expect(final.phase).toBe('complete');
    expect(final.completeReason).toBe('fold_to_one');
    expect(final.seats.reduce((sum, seat) => sum + seat.stack, 0)).toBe(4000);
  });

  it('never sends create_table and rejects a client-supplied stack on sit', async () => {
    const alice = await openPlayer();
    await sit(alice.root, '1', 'Alice');

    const sent: string[] = [];
    const probe = bridge.createSocket('wss://probe');
    probe.addEventListener('message', (event) => sent.push(String(event.data)));
    await bridge.settle();
    probe.send(JSON.stringify({ action: 'join_table', tableId: TABLE_ID }));
    probe.send(JSON.stringify({ action: 'sit', seatId: '2', displayName: 'Mallory', stack: 999999 }));
    await bridge.settle();

    expect(sent.some((row) => row.includes('client_supplied_state'))).toBe(true);
    expect(await bridge.store.getSeat(TABLE_ID, '2')).toBeNull();
  });
});
