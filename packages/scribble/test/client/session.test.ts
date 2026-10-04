import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchTableList, TableSession, type SessionEvent, type SocketFactory } from '../../src/client/session.js';
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

function setup(token: string | null = null) {
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
    onEvent: (event) => events.push(event),
  });
  session.connect();
  return { session, sockets, events, socket: () => sockets.at(-1)! };
}

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
    expect(socket().sent).toEqual([{ action: 'join_table', tableId: 'table-1' }]);
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

  it('sits as a guest without a token and never sends board, rack, score, or bag', async () => {
    const { session, socket } = setup(null);
    socket().open();
    socket().receive(waiting(false));
    await vi.waitFor(() => expect(socket().sent.at(-1)).toEqual({ action: 'sit' }));
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
    const { session, socket } = setup(null);
    socket().open();
    socket().receive(waiting(false));
    await vi.waitFor(() => expect(socket().sent.at(-1)).toEqual({ action: 'sit' }));
    socket().receive({ type: 'sat', seatId: '1', seatToken: 'tok' });
    session.leave();
    socket().receive({ type: 'left', seatId: '1' });
    const before = socket().sent.length;
    socket().receive(waiting(false));
    await vi.advanceTimersByTimeAsync(10);
    expect(socket().sent).toHaveLength(before);
    session.sit();
    await vi.waitFor(() => expect(socket().sent.at(-1)).toEqual({ action: 'sit' }));
  });

  it('refuses seated actions without a seat token instead of sending them', () => {
    const { session, socket, events } = setup(null);
    socket().open();
    session.play([{ tileId: 'x', row: 0, col: 0 }]);
    expect(socket().sent).toEqual([{ action: 'join_table', tableId: 'table-1' }]);
    expect(events.at(-1)).toEqual({ type: 'error', error: { type: 'error', code: 'not_seated' } });
  });

  it('drops the seat token when the socket closes and rejoins on reconnect', async () => {
    const { session, sockets, socket } = setup(null);
    socket().open();
    socket().receive({ type: 'sat', seatId: '1', seatToken: 'tok' });
    socket().readyState = 3;
    socket().onclose?.({} as CloseEvent);
    expect(session.seated).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets).toHaveLength(2);
    socket().open();
    expect(socket().sent).toEqual([{ action: 'join_table', tableId: 'table-1' }]);
  });
});

describe('lobby table list', () => {
  it('asks for the configured ids and resolves with the reply', async () => {
    const socket = new FakeSocket();
    const pending = fetchTableList('ws://test', ['a', 'b'], () => socket as never);
    socket.open();
    expect(socket.sent).toEqual([{ action: 'list_tables', tableIds: ['a', 'b'] }]);
    socket.receive({ type: 'table_list', tables: [{ tableId: 'a', seatedCount: 1, maxSeats: 4, status: 'waiting' }] });
    await expect(pending).resolves.toEqual([{ tableId: 'a', seatedCount: 1, maxSeats: 4, status: 'waiting' }]);
  });
});
