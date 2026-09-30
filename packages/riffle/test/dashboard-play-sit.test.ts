// @vitest-environment happy-dom

import { validateGamerTag } from '@galaxyclass/accounts/gamer-tag';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GetAccessToken } from '../src/client/dashboard-play/player-token.js';
import { startDashboardPlay, type DashboardPlaySession } from '../src/client/dashboard-play/session.js';
import { firstOpenSeat, TABLE_FULL_MESSAGE } from '../src/client/dashboard-play/sit-panel.js';
import { ACCOUNT_HINT_KEY, type AccountStorage } from '../src/client/dashboard-play/studio-account.js';
import { createPlayerResolver } from '../src/runtime/player-identity.js';
import type { PlayerSnapshotSeat, TableSnapshotMessage } from '../src/runtime/types.js';
import { validateDisplayName } from '../src/shared/display-name.js';
import { randomDisplayName } from '../src/shared/random-name.js';
import { accessClaims, attackerKey, signJwt, testAccessTokenVerifier } from './helpers/cognito-tokens.js';
import { configFetch, FakePlaySocket, flush, memoryStorage, setViewport } from './support/fake-play-socket.js';
import { RuntimeBridge } from './support/runtime-bridge.js';

const TABLE_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

function seat(seatId: string, overrides: Partial<PlayerSnapshotSeat> = {}): PlayerSnapshotSeat {
  return {
    seatId,
    displayName: `Player ${seatId}`,
    isLocal: false,
    stack: 2000,
    inHand: false,
    committed: 0,
    position: null,
    acting: false,
    folded: false,
    ...overrides,
  };
}

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

function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length]!;
}

function accountHint(hint: Record<string, unknown> | null): AccountStorage {
  return { getItem: (key) => (key === ACCOUNT_HINT_KEY && hint ? JSON.stringify(hint) : null) };
}

const SIGNED_IN = { signedIn: true, gamerTag: 'River_Rat', avatarId: 42 };

async function joinWithFakeSocket(
  first = snapshot({ seats: [seat('1', { displayName: 'Alice' })] }),
  accountStorage: AccountStorage | null = null,
  getAccessToken?: GetAccessToken,
) {
  const root = addRoot();
  let socket!: FakePlaySocket;
  const session = await startDashboardPlay({
    root,
    pathname: `/${TABLE_ID}`,
    fetch: configFetch().fetchImpl,
    storage: memoryStorage(),
    accountStorage,
    getAccessToken,
    createSocket: (url) => {
      socket = new FakePlaySocket(url);
      return socket;
    },
  });
  socket.emit('open');
  socket.receive(first);
  return { root, socket, session };
}

function panelStatus(root: HTMLElement): string {
  return root.querySelector('.sit-panel-status')?.textContent ?? '';
}

describe('firstOpenSeat', () => {
  it('picks the lowest empty seat', () => {
    expect(firstOpenSeat(snapshot())).toBe('1');
    expect(firstOpenSeat(snapshot({ seats: [seat('1'), seat('3')] }))).toBe('2');
  });

  it('skips seats the server just refused', () => {
    expect(firstOpenSeat(snapshot({ seats: [seat('1')] }), new Set(['2', '3']))).toBe('4');
  });

  it('falls back to an away seat once every seat is filled', () => {
    const full = ['1', '2', '3', '4', '5', '6', '7', '8'].map((id) => seat(id));
    expect(firstOpenSeat(snapshot({ seats: full }))).toBeNull();

    full[4] = seat('5', { away: true });
    expect(firstOpenSeat(snapshot({ seats: full }))).toBe('5');
  });

  it('leaves an away seat alone while it still holds cards in the live hand', () => {
    const full = ['1', '2', '3', '4', '5', '6', '7', '8'].map((id) => seat(id, { inHand: true }));
    full[2] = seat('3', { away: true, inHand: true });
    const live = snapshot({ status: 'hand_in_progress', phase: 'betting', seats: full });
    expect(firstOpenSeat(live)).toBeNull();
    expect(firstOpenSeat({ ...live, phase: 'complete' })).toBe('3');
  });
});

describe('randomDisplayName', () => {
  it('builds a valid two-word name', () => {
    const name = randomDisplayName([], sequence([0, 0]));
    expect(name).toBe('Lucky Otter');
    expect(validateDisplayName(name).ok).toBe(true);
  });

  it('avoids names already at the table regardless of case', () => {
    const name = randomDisplayName(['lucky otter'], sequence([0, 0, 0, 0.05]));
    expect(name).toBe('Lucky Falcon');
  });

  it('falls back to a numbered name when every pick collides', () => {
    const name = randomDisplayName(['Lucky Otter'], () => 0);
    expect(name).toBe('Otter 100');
    expect(validateDisplayName(name).ok).toBe(true);
  });

  it('never produces a valid gamer tag, so guests cannot look like accounts', () => {
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let index = 0; index < 500; index += 1) {
      expect(validateGamerTag(randomDisplayName([], random)).ok).toBe(false);
    }
    expect(validateGamerTag(randomDisplayName(['Lucky Otter'], () => 0)).ok).toBe(false);
  });
});

describe('dashboard play automatic seating', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    setViewport(1440);
  });

  it('sends a guest sit for the first open seat right after joining, with no name or avatar', async () => {
    const { root, socket } = await joinWithFakeSocket();

    expect(socket.actions()).toEqual(['join_table', 'sit']);
    expect(socket.sent.at(-1)).toEqual({ action: 'sit', seatId: '2' });
    expect(Object.keys(socket.sent.at(-1)!)).not.toContain('stack');
    expect(panelStatus(root)).toBe('Taking your seat…');
    expect(root.querySelector('[data-field="take-seat"]')).toBeNull();
    expect(root.querySelector('#sit-display-name')).toBeNull();
    expect(root.textContent).not.toMatch(/Sign in|Create account|Mic|Camera/);
  });

  it('sends only one sit while the first is in flight', async () => {
    const { socket } = await joinWithFakeSocket();
    socket.receive(snapshot({ seats: [seat('1', { displayName: 'Alice' }), seat('3')] }));
    expect(socket.actions().filter((action) => action === 'sit')).toHaveLength(1);
  });

  it('moves to the next open seat when the chosen one was just taken', async () => {
    const { socket } = await joinWithFakeSocket();
    socket.receive({ type: 'error', code: 'seat_occupied' });

    expect(socket.sent.at(-1)).toEqual({ action: 'sit', seatId: '3' });
  });

  it('sits a signed-in player with their access token and never sends the hint gamer tag or avatar', async () => {
    const { socket } = await joinWithFakeSocket(undefined, accountHint(SIGNED_IN), async () => 'access-token');
    await flush();

    expect(socket.sent.at(-1)).toEqual({ action: 'sit', seatId: '2', accessToken: 'access-token' });
    expect(JSON.stringify(socket.sent)).not.toMatch(/River_Rat|avatarId|displayName/);
  });

  it('sits as a guest when the studio session has no token', async () => {
    const { socket } = await joinWithFakeSocket(undefined, accountHint(SIGNED_IN), async () => null);
    await flush();

    expect(socket.sent.at(-1)).toEqual({ action: 'sit', seatId: '2' });
  });

  it('retries as a guest when the server cannot verify the token', async () => {
    const { socket } = await joinWithFakeSocket(undefined, accountHint(SIGNED_IN), async () => 'stale-token');
    await flush();
    socket.receive({ type: 'error', code: 'invalid_access_token' });

    expect(socket.sent.at(-1)).toEqual({ action: 'sit', seatId: '2' });
    expect(socket.actions().filter((action) => action === 'sit')).toHaveLength(2);
  });

  it('stops and explains when the account is already seated at the table', async () => {
    const { root, socket } = await joinWithFakeSocket(undefined, accountHint(SIGNED_IN), async () => 'token');
    await flush();
    socket.receive({ type: 'error', code: 'account_already_seated' });
    socket.receive(snapshot({ seats: [seat('1', { displayName: 'River_Rat' })] }));

    expect(socket.actions().filter((action) => action === 'sit')).toHaveLength(1);
    expect(root.querySelector('[data-field="take-seat"]')).not.toBeNull();
  });

  it('shows a table-full notice and sits once a seat opens', async () => {
    const full = ['1', '2', '3', '4', '5', '6', '7', '8'].map((id) => seat(id));
    const { root, socket } = await joinWithFakeSocket(snapshot({ seats: full, seatedPlayersLabel: '8 / 8' }));

    expect(socket.actions()).toEqual(['join_table']);
    expect(panelStatus(root)).toBe(TABLE_FULL_MESSAGE);

    socket.receive(snapshot({ seats: full.filter((row) => row.seatId !== '6'), seatedPlayersLabel: '7 / 8' }));
    expect(socket.sent.at(-1)).toMatchObject({ action: 'sit', seatId: '6' });
  });

  it('keeps the seat token and sends it on betting actions', async () => {
    const { root, socket, session } = await joinWithFakeSocket();
    socket.receive({ type: 'sat', seatId: '2', seatToken: 'token-abc' });
    expect(session.hasSeatToken()).toBe(true);

    const seats = [seat('1', { displayName: 'Alice' }), seat('2', { displayName: 'Lucky Otter', isLocal: true })];
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

    expect(root.querySelector('[data-field="sit-panel"]')).toBeNull();
    expect(root.querySelector('[data-field="deal-hand"]')).toBeNull();
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
    const profiles: Record<string, { gamerTag: string; avatarId: number }> = {
      'sub-maya': { gamerTag: 'Maya_P', avatarId: 42 },
    };
    bridge = new RuntimeBridge(
      42,
      null,
      createPlayerResolver(testAccessTokenVerifier(), async (sub) => profiles[sub] ?? { gamerTag: null, avatarId: null }),
    );
    await bridge.store.createTable(TABLE_ID, '2026-09-25T12:00:00.000Z');
  });

  async function openPlayer(
    accountStorage: AccountStorage | null = null,
    getAccessToken?: GetAccessToken,
  ): Promise<{ root: HTMLElement; session: DashboardPlaySession }> {
    const root = addRoot();
    const session = await startDashboardPlay({
      root,
      pathname: `/${TABLE_ID}`,
      fetch: configFetch().fetchImpl,
      storage: memoryStorage(),
      accountStorage,
      getAccessToken,
      createSocket: bridge.createSocket,
    });
    for (let round = 0; round < 3; round += 1) {
      await bridge.settle();
      await flush();
    }
    return { root, session };
  }

  async function playToCompletion(
    players: Array<{ root: HTMLElement; session: DashboardPlaySession }>,
    choose: (root: HTMLElement) => HTMLButtonElement,
  ): Promise<void> {
    for (let step = 0; step < 40; step += 1) {
      if (players[0]!.session.snapshot?.phase === 'complete') {
        return;
      }
      const actor = players.find(({ root }) => root.querySelector('[data-field="action-controls"]'));
      expect(actor, `someone should be acting at step ${step}`).toBeDefined();
      choose(actor!.root).click();
      await bridge.settle();
      await flush();
    }
    throw new Error('hand did not complete');
  }

  it('sits both players automatically, deals, and plays check/call to showdown', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();

    expect(alice.session.hasSeatToken()).toBe(true);
    expect(bob.session.hasSeatToken()).toBe(true);
    const aliceSeat = alice.session.snapshot!.seats.find((row) => row.seatId === '1')!;
    expect(aliceSeat.stack + aliceSeat.committed).toBe(2000);
    const bobName = (await bridge.store.getSeat(TABLE_ID, '2'))!.displayName;
    expect(validateDisplayName(bobName).ok).toBe(true);
    expect(alice.root.querySelector('[data-region="player-row"]')?.textContent).toContain(bobName);
    expect(
      bob.root.querySelector('[data-local="true"] [data-field="avatar"]')?.getAttribute('src'),
    ).toMatch(/^https:\/\/galaxyclass\.app\/avatars\/\d+\.webp$/);

    expect(alice.session.snapshot?.status).toBe('hand_in_progress');
    expect(alice.session.snapshot?.pocketCards).toHaveLength(2);
    expect(bob.session.snapshot?.pocketCards).toHaveLength(2);
    expect(alice.session.snapshot?.pocketCards).not.toEqual(bob.session.snapshot?.pocketCards);

    await playToCompletion(
      [alice, bob],
      (root) =>
        root.querySelector<HTMLButtonElement>('[data-action="check"]') ??
        root.querySelector<HTMLButtonElement>('[data-action="call"]')!,
    );

    const final = alice.session.snapshot!;
    expect(final.phase).toBe('complete');
    expect(final.completeReason).toBe('showdown');
    expect(final.board).toHaveLength(5);
    expect(final.seats.reduce((sum, row) => sum + row.stack, 0)).toBe(4000);
    expect(final.seats.some((row) => (row.wonAmount ?? 0) > 0)).toBe(true);
    expect(alice.root.textContent).toContain('Hand complete');
    expect(alice.root.textContent).toContain('Next hand starts in a moment.');
  });

  it('completes a hand by fold-out', async () => {
    const alice = await openPlayer();
    const bob = await openPlayer();

    await playToCompletion([alice, bob], (root) =>
      root.querySelector<HTMLButtonElement>('[data-action="fold"]')!,
    );

    const final = bob.session.snapshot!;
    expect(final.phase).toBe('complete');
    expect(final.completeReason).toBe('fold_to_one');
    expect(final.seats.reduce((sum, row) => sum + row.stack, 0)).toBe(4000);
  });

  it('shows the verified gamer tag and avatar to every player; guests get a random Galaxy Class avatar', async () => {
    // The hint is display-only: Maya's seat comes from her verified token's profile, not these values.
    const maya = await openPlayer(
      accountHint({ signedIn: true, gamerTag: 'Spoofed_Tag', avatarId: 7 }),
      async () => signJwt(accessClaims({ sub: 'sub-maya' })),
    );
    const guest = await openPlayer();

    const mayaSeat = (await bridge.store.getSeat(TABLE_ID, '1'))!;
    expect(mayaSeat).toMatchObject({ displayName: 'Maya_P', avatarId: 42 });
    const guestSeat = (await bridge.store.getSeat(TABLE_ID, '2'))!;
    expect(guestSeat.avatarId).toBeGreaterThanOrEqual(1);
    expect(guestSeat.avatarId).toBeLessThanOrEqual(116);

    expect(guest.root.querySelector('[data-region="player-row"]')?.textContent).toContain('Maya_P');
    expect(guest.root.textContent).not.toContain('@');
    const avatars = Array.from(
      guest.root.querySelectorAll<HTMLImageElement>('[data-field="avatar"]'),
    ).map((image) => image.getAttribute('src'));
    expect(avatars).toContain('https://galaxyclass.app/avatars/42.webp');
    expect(
      maya.root.querySelector('[data-local="true"] [data-field="avatar"]')?.getAttribute('src'),
    ).toBe('https://galaxyclass.app/avatars/42.webp');
    expect(guest.session.snapshot?.seats.find((row) => row.seatId === '2')?.avatarId).toBe(
      guestSeat.avatarId,
    );
    expect(guest.root.textContent).not.toContain('Spoofed_Tag');
  });

  it('seats a player whose hint claims a gamer tag, but who has no verified token, as a guest', async () => {
    await openPlayer(accountHint({ signedIn: true, gamerTag: 'Maya_P', avatarId: 42 }), async () => null);
    const seat1 = (await bridge.store.getSeat(TABLE_ID, '1'))!;
    expect(seat1.displayName).not.toBe('Maya_P');
    expect(validateGamerTag(seat1.displayName).ok).toBe(false);
  });

  it('refuses a forged token end to end and seats the player as a guest', async () => {
    const forged = await openPlayer(
      accountHint({ signedIn: true, gamerTag: 'Maya_P', avatarId: 42 }),
      async () => signJwt(accessClaims({ sub: 'sub-maya' }), attackerKey),
    );
    const seat1 = (await bridge.store.getSeat(TABLE_ID, '1'))!;
    expect(seat1.displayName).not.toBe('Maya_P');
    expect(seat1.playerSub).toBeUndefined();
    expect(forged.session.hasSeatToken()).toBe(true);
  });

  it('never sends create_table and rejects a client-supplied stack on sit', async () => {
    await openPlayer();

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
