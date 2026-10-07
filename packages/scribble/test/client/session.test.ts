import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memberRequest, TableSession, type SeatTokenStore, type SessionEvent, type SocketFactory } from '../../src/client/session.js';
import { snapshot } from '../support/snapshots.js';

class FakeSocket {
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.onclose?.({} as CloseEvent);
  }
  open() {
    this.readyState = 1;
    this.onopen?.({} as Event);
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
  }
}

const STATE_KEYS = ['board', 'rack', 'racks', 'score', 'scores', 'bag', 'bagCount', 'players', 'seats', 'game'];

function memoryStore(initial: string | null = null): SeatTokenStore & { value: string | null } {
  return {
    value: initial,
    get() {
      return this.value;
    },
    set(token) {
      this.value = token;
    },
    clear() {
      this.value = null;
    },
  };
}

function setup(token: string | null = 'access', seatStore?: SeatTokenStore) {
  const sockets: FakeSocket[] = [];
  const factory: SocketFactory = () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket as never;
  };
  const events: SessionEvent[] = [];
  const session = new TableSession({
    url: 'ws://test',
    tableId: 'table-1',
    getAccessToken: async () => token,
    socketFactory: factory,
    seatStore,
    onEvent: (event) => events.push(event),
  });
  session.connect();
  return { session, sockets, events, socket: () => sockets.at(-1)! };
}

const playingWithoutYou = () => snapshot({ status: 'playing', you: null });

const waiting = (you: boolean) =>
  snapshot({
    status: 'waiting',
    you: you ? { seatId: '1', rack: [] } : null,
    seats: snapshot().seats.map((s) => (s.seatId === '1' ? { ...s, occupied: you } : s)),
  });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('table session', () => {
  it('joins on open, sits with the access token, and keeps the seat token for later actions', async () => {
    const { session, socket } = setup('access-token-1');
    socket().open();
    await vi.waitFor(() =>
      expect(socket().sent).toEqual([{ action: 'join_table', tableId: 'table-1', accessToken: 'access-token-1' }]),
    );
    socket().receive(waiting(false));
    await vi.waitFor(() => expect(socket().sent.at(-1)).toEqual({ action: 'sit', accessToken: 'access-token-1' }));
    socket().receive({ type: 'sat', seatId: '1', seatToken: 'seat-secret' });
    expect(session.seated).toBe(true);
    session.play([{ tileId: 't1', row: 7, col: 7 }]);
    session.setTheme('halloween');
    expect(socket().sent.slice(-2)).toEqual([
      { action: 'play', placements: [{ tileId: 't1', row: 7, col: 7 }], seatToken: 'seat-secret' },
      { action: 'set_theme', themeId: 'halloween', seatToken: 'seat-secret' },
    ]);
  });

  it('never sends board, rack, score, or bag', async () => {
    const { session, socket } = setup();
    socket().open();
    socket().receive(waiting(false));
    await vi.waitFor(() => expect(socket().sent.at(-1)).toEqual({ action: 'sit', accessToken: 'access' }));
    socket().receive({ type: 'sat', seatId: '1', seatToken: 'tok' });
    session.startGame();
    session.pass();
    session.exchange(['a', 'b']);
    session.leave();
    for (const message of socket().sent) {
      for (const key of STATE_KEYS) {
        expect(message).not.toHaveProperty(key);
      }
    }
  });

  it('stays standing after leaving until the player asks to sit again', async () => {
    const { session, socket } = setup();
    socket().open();
    socket().receive(waiting(false));
    await vi.waitFor(() => expect(socket().sent.at(-1)).toEqual({ action: 'sit', accessToken: 'access' }));
    socket().receive({ type: 'sat', seatId: '1', seatToken: 'tok' });
    session.leave();
    socket().receive({ type: 'left', seatId: '1' });
    const before = socket().sent.length;
    socket().receive(waiting(false));
    await vi.advanceTimersByTimeAsync(10);
    expect(socket().sent).toHaveLength(before);
    session.sit();
    await vi.waitFor(() => expect(socket().sent.at(-1)).toEqual({ action: 'sit', accessToken: 'access' }));
  });

  it('refuses seated actions without a seat token instead of sending them', async () => {
    const { session, socket, events } = setup();
    socket().open();
    session.play([{ tileId: 'x', row: 0, col: 0 }]);
    await vi.waitFor(() => expect(socket().sent).toEqual([{ action: 'join_table', tableId: 'table-1', accessToken: 'access' }]));
    expect(events.at(-1)).toEqual({ type: 'error', error: { type: 'error', code: 'not_seated' } });
  });

  it('drops the seat token when the socket closes and rejoins on reconnect', async () => {
    const { session, sockets, socket } = setup();
    socket().open();
    socket().receive({ type: 'sat', seatId: '1', seatToken: 'tok' });
    socket().readyState = 3;
    socket().onclose?.({} as CloseEvent);
    expect(session.seated).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets).toHaveLength(2);
    socket().open();
    await vi.waitFor(() => expect(socket().sent).toEqual([{ action: 'join_table', tableId: 'table-1', accessToken: 'access' }]));
  });

  it('takes the held seat back with the stored token after a reconnect', async () => {
    const store = memoryStore();
    const { session, socket } = setup('access', store);
    socket().open();
    socket().receive(waiting(false));
    await vi.waitFor(() => expect(socket().sent.at(-1)).toEqual({ action: 'sit', accessToken: 'access' }));
    socket().receive({ type: 'sat', seatId: '1', seatToken: 'seat-secret' });
    expect(store.value).toBe('seat-secret');

    socket().readyState = 3;
    socket().onclose?.({} as CloseEvent);
    await vi.advanceTimersByTimeAsync(1000);
    socket().open();
    socket().receive(playingWithoutYou());
    expect(socket().sent.at(-1)).toEqual({ action: 'resume', seatToken: 'seat-secret' });
    socket().receive({ type: 'sat', seatId: '1', seatToken: 'seat-secret-2' });
    expect(session.seated).toBe(true);
    expect(store.value).toBe('seat-secret-2');
  });

  it('sits fresh when the stored seat is no longer held', async () => {
    const store = memoryStore('stale');
    const { socket } = setup('access', store);
    socket().open();
    socket().receive(waiting(false));
    expect(socket().sent.at(-1)).toEqual({ action: 'resume', seatToken: 'stale' });
    socket().receive({ type: 'error', code: 'invalid_seat_token' });
    expect(store.value).toBeNull();
    await vi.waitFor(() => expect(socket().sent.at(-1)).toEqual({ action: 'sit', accessToken: 'access' }));
  });

  it('stops reclaiming once the seat moves to another window, but keeps the token', async () => {
    const store = memoryStore();
    const { session, socket, events } = setup('access', store);
    socket().open();
    socket().receive(waiting(false));
    await vi.waitFor(() => expect(socket().sent.at(-1)).toEqual({ action: 'sit', accessToken: 'access' }));
    socket().receive({ type: 'sat', seatId: '1', seatToken: 'tok' });
    socket().receive({ type: 'left', seatId: '1', reason: 'taken_over' });
    expect(events.at(-1)).toEqual({ type: 'left', reason: 'taken_over' });
    expect(session.seated).toBe(false);
    const before = socket().sent.length;
    socket().receive(playingWithoutYou());
    await vi.advanceTimersByTimeAsync(10);
    expect(socket().sent).toHaveLength(before);
    expect(store.value).toBe('tok');
  });

  it('gives the stored token up on an explicit leave', async () => {
    const store = memoryStore();
    const { session, socket } = setup('access', store);
    socket().open();
    socket().receive(waiting(false));
    await vi.waitFor(() => expect(socket().sent.at(-1)).toEqual({ action: 'sit', accessToken: 'access' }));
    socket().receive({ type: 'sat', seatId: '1', seatToken: 'tok' });
    session.leave();
    socket().receive({ type: 'left', seatId: '1' });
    expect(store.value).toBeNull();
  });

  it('replaces a socket that went quiet while the computer slept', async () => {
    const { session, sockets, socket } = setup();
    socket().open();
    session.wake();
    expect(socket().sent.at(-1)).toEqual({ action: 'ping' });
    await vi.advanceTimersByTimeAsync(8000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets).toHaveLength(2);
  });

  it('keeps a socket that answers the wake-up ping', async () => {
    const { session, sockets, socket } = setup();
    socket().open();
    session.wake();
    socket().receive({ type: 'pong' });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(sockets).toHaveLength(1);
  });

  it('stops for good when the host deletes the table, forgetting the seat', async () => {
    const store = memoryStore();
    const { sockets, socket, events } = setup('access', store);
    socket().open();
    socket().receive(waiting(false));
    await vi.waitFor(() => expect(socket().sent.at(-1)).toEqual({ action: 'sit', accessToken: 'access' }));
    socket().receive({ type: 'sat', seatId: '1', seatToken: 'tok' });

    socket().receive({ type: 'table_deleted', tableId: 'another-table' });
    expect(events.some((e) => e.type === 'deleted')).toBe(false);

    socket().receive({ type: 'table_deleted', tableId: 'table-1' });
    expect(events.at(-1)).toEqual({ type: 'deleted' });
    expect(store.value).toBeNull();
    expect(socket().readyState).toBe(3);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(1);
  });

  it('never stops trying to reconnect', async () => {
    const { sockets, socket } = setup();
    for (let i = 0; i < 12; i++) {
      socket().readyState = 3;
      socket().onclose?.({} as CloseEvent);
      await vi.advanceTimersByTimeAsync(15_000);
    }
    expect(sockets).toHaveLength(13);
  });
});

describe('members only', () => {
  it('asks a signed-out visitor to sign in instead of joining', async () => {
    const { socket, events } = setup(null);
    socket().open();
    await vi.waitFor(() => expect(events.at(-1)).toEqual({ type: 'error', error: { type: 'error', code: 'sign_in_required' } }));
    expect(socket().sent).toEqual([]);
  });

  it('watches a game in progress, then takes a seat once it ends', async () => {
    const { socket } = setup();
    socket().open();
    socket().receive(playingWithoutYou());
    await vi.waitFor(() => expect(socket().sent.at(-1)).toEqual({ action: 'sit', accessToken: 'access' }));
    socket().receive({ type: 'error', code: 'table_locked' });
    const before = socket().sent.length;
    socket().receive(playingWithoutYou());
    await vi.advanceTimersByTimeAsync(10);
    expect(socket().sent).toHaveLength(before);

    socket().receive(snapshot({ status: 'ended', you: null }));
    await vi.waitFor(() => expect(socket().sent).toHaveLength(before + 1));
    expect(socket().sent.at(-1)).toEqual({ action: 'sit', accessToken: 'access' });
  });
});

describe('member requests', () => {
  it('sends one action and resolves with its reply, ignoring other frames', async () => {
    const socket = new FakeSocket();
    const pending = memberRequest('ws://test', { action: 'list_my_tables', accessToken: 'access' }, () => socket as never);
    socket.open();
    expect(socket.sent).toEqual([{ action: 'list_my_tables', accessToken: 'access' }]);
    socket.receive({ type: 'pong' });
    socket.receive({ type: 'my_tables', you: { gamerTag: 'WordSmith', avatarId: 12 }, tables: [] });
    await expect(pending).resolves.toEqual({ type: 'my_tables', you: { gamerTag: 'WordSmith', avatarId: 12 }, tables: [] });
    expect(socket.readyState).toBe(3);
  });

  it('resolves null when the socket closes or the reply never comes', async () => {
    const closed = new FakeSocket();
    const first = memberRequest('ws://test', { action: 'list_my_tables' }, () => closed as never);
    closed.close();
    await expect(first).resolves.toBeNull();

    const silent = new FakeSocket();
    const second = memberRequest('ws://test', { action: 'list_my_tables' }, () => silent as never, 500);
    silent.open();
    await vi.advanceTimersByTimeAsync(500);
    await expect(second).resolves.toBeNull();
  });
});
