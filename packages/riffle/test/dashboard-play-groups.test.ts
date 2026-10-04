// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { parseGroupIdFromPath } from '../src/client/dashboard-play/route.js';
import { startDashboardPlay } from '../src/client/dashboard-play/session.js';
import type { PlayerSnapshotSeat, TableSnapshotMessage } from '../src/runtime/types.js';
import { configFetch, FakePlaySocket, memoryStorage, setViewport } from './support/fake-play-socket.js';

const TABLE_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const NEXT_ID = '11111111-1111-4111-8111-111111111111';

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

describe('parseGroupIdFromPath', () => {
  it('reads a stakes slug and ignores the lobby and table ids', () => {
    expect(parseGroupIdFromPath('/riffle/the-limp')).toBe('the-limp');
    expect(parseGroupIdFromPath('/the-button/')).toBe('the-button');
    expect(parseGroupIdFromPath('/riffle')).toBeNull();
    expect(parseGroupIdFromPath('/riffle/')).toBeNull();
    expect(parseGroupIdFromPath(`/${TABLE_ID}`)).toBeNull();
    expect(parseGroupIdFromPath('/Not_A_Slug')).toBeNull();
  });
});

describe('group join', () => {
  it('asks for a table, rewrites the url, then joins it', async () => {
    const root = document.createElement('main');
    document.body.append(root);
    const urls: string[] = [];
    let socket!: FakePlaySocket;
    const session = await startDashboardPlay({
      root,
      pathname: '/riffle/the-limp',
      fetch: configFetch().fetchImpl,
      storage: memoryStorage(),
      replaceLocation: (url) => urls.push(url),
      createSocket: (url) => {
        socket = new FakePlaySocket(url);
        return socket;
      },
    });

    socket.emit('open');
    expect(socket.sent[0]).toEqual({ action: 'join_group', groupId: 'the-limp' });

    socket.receive({ type: 'group_table', groupId: 'the-limp', tableId: TABLE_ID });
    expect(urls).toEqual([`/${TABLE_ID}`]);
    expect(session.tableId).toBe(TABLE_ID);
    expect(socket.sent[1]).toEqual({ action: 'join_table', tableId: TABLE_ID });

    socket.receive(snapshot({ tableName: 'The Limp' }));
    expect(root.querySelector('[data-field="table-name"]')?.textContent).toBe('The Limp');
  });

  it('asks for another table when the assigned one is full', async () => {
    const root = document.createElement('main');
    document.body.append(root);
    let socket!: FakePlaySocket;
    await startDashboardPlay({
      root,
      pathname: '/the-limp',
      fetch: configFetch().fetchImpl,
      storage: memoryStorage(),
      replaceLocation: () => undefined,
      createSocket: (url) => {
        socket = new FakePlaySocket(url);
        return socket;
      },
    });

    socket.emit('open');
    socket.receive({ type: 'group_table', groupId: 'the-limp', tableId: TABLE_ID });
    const full = ['1', '2', '3', '4', '5', '6', '7', '8'].map((id) => seat(id));
    socket.receive(snapshot({ seats: full }));

    expect(socket.sent.at(-1)).toEqual({ action: 'join_group', groupId: 'the-limp' });

    socket.receive({ type: 'group_table', groupId: 'the-limp', tableId: NEXT_ID });
    expect(socket.sent.at(-1)).toEqual({ action: 'join_table', tableId: NEXT_ID });
  });
});

describe('leave table', () => {
  it('leaves for a watcher without a seat and for a seated player mid-hand', async () => {
    setViewport(1280);
    const root = document.createElement('main');
    document.body.append(root);
    const locations: string[] = [];
    let socket!: FakePlaySocket;
    await startDashboardPlay({
      root,
      pathname: `/${TABLE_ID}`,
      fetch: configFetch().fetchImpl,
      storage: memoryStorage(),
      assignLocation: (url) => locations.push(url),
      createSocket: (url) => {
        socket = new FakePlaySocket(url);
        return socket;
      },
    });

    socket.emit('open');
    socket.receive(snapshot({ seats: [seat('2')] }));
    expect(root.querySelector('[data-field="leave-seat"]')).toBeNull();
    root.querySelector<HTMLButtonElement>('[data-field="leave-table"]')?.click();
    expect(locations).toEqual(['/']);
    expect(socket.closed).toBe(true);
    expect(socket.sent.some((message) => message.action === 'leave')).toBe(false);
  });

  it('sends leave and returns to the list even while the seat remains for the hand', async () => {
    setViewport(390);
    const root = document.createElement('main');
    document.body.append(root);
    const locations: string[] = [];
    let socket!: FakePlaySocket;
    await startDashboardPlay({
      root,
      pathname: `/${TABLE_ID}`,
      fetch: configFetch().fetchImpl,
      storage: memoryStorage(),
      assignLocation: (url) => locations.push(url),
      createSocket: (url) => {
        socket = new FakePlaySocket(url);
        return socket;
      },
    });

    socket.emit('open');
    socket.receive(snapshot());
    socket.receive({ type: 'sat', seatId: '1', seatToken: 'tok' });
    socket.receive(snapshot({ seats: [seat('1', { isLocal: true, displayName: 'You' })] }));

    expect(root.querySelector('[data-field="leave-seat"]')).toBeNull();
    const leave = root.querySelector<HTMLButtonElement>('[data-field="leave-table"]');
    expect(leave?.textContent).toBe('Leave table');
    expect(root.dataset.breakpoint).toBe('phone');
    leave?.click();
    expect(socket.sent.at(-1)).toMatchObject({ action: 'leave', seatToken: 'tok' });
    expect(locations).toEqual([]);

    socket.receive(
      snapshot({
        status: 'hand_in_progress',
        phase: 'betting',
        seats: [seat('1', { isLocal: true })],
      }),
    );
    expect(locations).toEqual(['/']);
    expect(socket.closed).toBe(true);
  });
});
