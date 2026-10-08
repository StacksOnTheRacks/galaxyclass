import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_SUPPLIED_STATE_KEYS } from '../../src/protocol.js';
import { tokenSubject } from '../../src/client/player-token.js';
import {
  memberRequest,
  TableSession,
  type SeatTokenStore,
  type SessionEvent,
  type SocketFactory,
} from '../../src/client/session.js';
import { seatTokenStore } from '../../src/client/table-app.js';
import { FLEET_A, shotEvent, snapshot } from './support.js';

class FakeSocket {
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close(): void {
    this.closed = true;
    this.readyState = 3;
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }
  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
  }
  drop(): void {
    this.readyState = 3;
    this.onclose?.({} as CloseEvent);
  }
  actions(): unknown[] {
    return this.sent.map((m) => m.action);
  }
}

/** An access token shaped like a JWT; the session reads only its `sub`, and never verifies it. */
const accessTokenFor = (sub: string) => `header.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.signature`;

/** Stands in for one browser profile's localStorage: seat tokens keyed by member. */
function sharedStore(): { tokens: Map<string, string>; store: SeatTokenStore } {
  const tokens = new Map<string, string>();
  return {
    tokens,
    store: {
      get: (member) => tokens.get(member) ?? null,
      set: (member, token) => void tokens.set(member, token),
      clear: (member) => void tokens.delete(member),
    },
  };
}

function setup(options: { stored?: string | null; sub?: string; profile?: ReturnType<typeof sharedStore> } = {}) {
  const sockets: FakeSocket[] = [];
  const factory: SocketFactory = () => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  };
  const events: SessionEvent[] = [];
  const sub = options.sub ?? 'sub-admiral';
  const profile = options.profile ?? sharedStore();
  if (options.stored) {
    profile.tokens.set(sub, options.stored);
  }
  let now = 1_000;
  const session = new TableSession({
    url: 'ws://test',
    tableId: 'table-1',
    getAccessToken: async () => accessTokenFor(sub),
    seatStore: profile.store,
    socketFactory: factory,
    now: () => now,
    onEvent: (event) => events.push(event),
  });
  return {
    session,
    sockets,
    events,
    socket: () => sockets.at(-1)!,
    stored: () => profile.tokens.get(sub) ?? null,
    setNow: (t: number) => (now = t),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Joins, receives an open-seat snapshot, and sits as seat 1. */
async function seated(t: ReturnType<typeof setup>) {
  t.session.connect();
  t.socket().open();
  await flush();
  t.socket().receive(snapshot({ status: 'waiting', you: null, target: null }));
  await flush();
  t.socket().receive({ type: 'sat', tableId: 'table-1', seatId: '1', seatToken: 'seat-token-1' });
}

describe('table session', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }));
  afterEach(() => vi.useRealTimers());

  it('pings to calibrate the clock, joins with the access token, and sits in an open seat', async () => {
    const t = setup();
    await seated(t);
    expect(t.socket().actions()).toEqual(['ping', 'join_table', 'sit']);
    expect(t.socket().sent[1]).toEqual({ action: 'join_table', tableId: 'table-1', accessToken: accessTokenFor('sub-admiral') });
    expect(t.stored()).toBe('seat-token-1');
    expect(t.session.seated).toBe(true);
  });

  it('reports each pong with the send and receive times of the ping it answers', async () => {
    const t = setup();
    t.session.connect();
    t.setNow(5_000);
    t.socket().open();
    t.setNow(5_060);
    t.socket().receive({ type: 'pong', serverTs: 99_000 });
    expect(t.events).toContainEqual({ type: 'pong', serverTs: 99_000, sentAt: 5_000, receivedAt: 5_060 });
    // An unsolicited pong (nothing in flight) carries no timing and is dropped.
    t.events.length = 0;
    t.socket().receive({ type: 'pong', serverTs: 99_100 });
    expect(t.events.filter((e) => e.type === 'pong')).toEqual([]);
  });

  it('sends a few calibration pings after opening, then stops', async () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    const t = setup();
    t.session.connect();
    t.socket().open();
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 5; i++) {
      t.socket().receive({ type: 'pong', serverTs: 1 });
      await vi.advanceTimersByTimeAsync(400);
    }
    expect(t.socket().actions().filter((a) => a === 'ping')).toHaveLength(3);
    t.session.close();
  });

  it('passes shots for this table straight through, before any snapshot', async () => {
    const t = setup();
    await seated(t);
    const shot = shotEvent();
    t.socket().receive(shot);
    t.socket().receive({ ...shot, tableId: 'other' });
    expect(t.events.filter((e) => e.type === 'shot')).toEqual([{ type: 'shot', shot }]);
  });

  it('sends only rules input with the seat token, never client-supplied state', async () => {
    const t = setup();
    await seated(t);
    const extra = FLEET_A.map((p) => ({ ...p, sunk: true, hits: 3 }));
    t.session.placeFleet(extra);
    t.session.fire({ row: 2, col: 6, result: 'hit' } as never);
    t.session.unready();
    t.session.forfeit();
    t.session.rematch();
    t.session.claimAbandoned();
    const actions = t.socket().sent.slice(3);
    expect(actions.map((m) => m.action)).toEqual(['place_fleet', 'fire', 'unready', 'forfeit', 'rematch', 'claim_abandoned']);
    expect(actions.every((m) => m.seatToken === 'seat-token-1')).toBe(true);
    expect(actions[0]!.fleet).toEqual(FLEET_A);
    expect(actions[1]!.target).toEqual({ row: 2, col: 6 });
    const keys = new Set<string>();
    const walk = (value: unknown) => {
      if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
          keys.add(k);
          walk(v);
        }
      }
    };
    actions.forEach(walk);
    for (const key of CLIENT_SUPPLIED_STATE_KEYS) {
      expect(keys.has(key)).toBe(false);
    }
  });

  it('refuses seated actions before it has a seat', async () => {
    const t = setup();
    t.session.connect();
    t.socket().open();
    t.session.fire({ row: 0, col: 0 });
    expect(t.socket().actions()).not.toContain('fire');
    expect(t.events).toContainEqual({ type: 'error', error: { type: 'error', code: 'not_seated' } });
  });

  it('takes a held seat back with the stored token after a reconnect', async () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    const t = setup({ stored: 'held-token' });
    t.session.connect();
    t.socket().open();
    await vi.advanceTimersByTimeAsync(0);
    t.socket().receive(snapshot({ you: null, target: null }));
    expect(t.socket().actions()).toEqual(['ping', 'join_table', 'resume']);
    expect(t.socket().sent[2]).toEqual({ action: 'resume', seatToken: 'held-token' });

    t.socket().drop();
    expect(t.events.at(-1)).toEqual({ type: 'status', status: 'closed' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.sockets).toHaveLength(2);
    t.session.close();
  });

  it('sits fresh when the held seat is gone', async () => {
    const t = setup({ stored: 'stale' });
    t.session.connect();
    t.socket().open();
    await flush();
    t.socket().receive(snapshot({ status: 'waiting', you: null, target: null }));
    t.socket().receive({ type: 'error', code: 'invalid_seat_token' });
    await flush();
    expect(t.socket().actions()).toEqual(['ping', 'join_table', 'resume', 'sit']);
    expect(t.stored()).toBeNull();
  });

  it('keeps two members’ seat tokens apart in one browser profile', async () => {
    const profile = sharedStore();
    const admiral = setup({ sub: 'sub-admiral', profile });
    await seated(admiral);
    expect(profile.tokens.get('sub-admiral')).toBe('seat-token-1');

    const captain = setup({ sub: 'sub-captain', profile });
    captain.session.connect();
    captain.socket().open();
    await flush();
    captain.socket().receive(snapshot({ status: 'waiting', you: null, target: null }));
    await flush();
    // The admiral's token is never offered on the captain's connection.
    expect(captain.socket().actions()).toEqual(['ping', 'join_table', 'sit']);
    captain.socket().receive({ type: 'sat', tableId: 'table-1', seatId: '2', seatToken: 'seat-token-2' });
    expect(profile.tokens).toEqual(
      new Map([
        ['sub-admiral', 'seat-token-1'],
        ['sub-captain', 'seat-token-2'],
      ]),
    );
  });

  it('sits fresh, without a toast, when the server says the stored seat is another member’s', async () => {
    const t = setup({ stored: 'someone-elses' });
    t.session.connect();
    t.socket().open();
    await flush();
    t.socket().receive(snapshot({ status: 'battle', you: null, target: null }));
    t.socket().receive({ type: 'error', code: 'seat_not_yours' });
    await flush();
    expect(t.socket().actions()).toEqual(['ping', 'join_table', 'resume', 'sit']);
    expect(t.stored()).toBeNull();
    expect(t.events.filter((e) => e.type === 'error')).toEqual([]);
  });

  it('stores nothing when the access token has no readable subject', async () => {
    const profile = sharedStore();
    const socket = new FakeSocket();
    const session = new TableSession({
      url: 'ws://test',
      tableId: 'table-1',
      getAccessToken: async () => 'opaque-token',
      seatStore: profile.store,
      socketFactory: () => socket,
      onEvent: () => {},
    });
    session.connect();
    socket.open();
    await flush();
    socket.receive(snapshot({ status: 'waiting', you: null, target: null }));
    await flush();
    socket.receive({ type: 'sat', tableId: 'table-1', seatId: '1', seatToken: 'seat-token-1' });
    expect(socket.actions()).toEqual(['ping', 'join_table', 'sit']);
    expect(profile.tokens.size).toBe(0);
    session.close();
  });

  it('shows the locked notice mid-game and sits once that game is over', async () => {
    const t = setup();
    t.session.connect();
    t.socket().open();
    await flush();
    t.socket().receive(snapshot({ status: 'battle', you: null, target: null }));
    await flush();
    t.socket().receive({ type: 'error', code: 'table_locked' });
    t.socket().receive(snapshot({ status: 'battle', you: null, target: null, version: 2 }));
    await flush();
    expect(t.socket().actions().filter((a) => a === 'sit')).toHaveLength(1);
    t.socket().receive(snapshot({ status: 'finished', you: null, target: null, version: 3 }));
    await flush();
    expect(t.socket().actions().filter((a) => a === 'sit')).toHaveLength(2);
  });

  it('stops for good when another window takes the seat or the table is deleted', async () => {
    const t = setup();
    await seated(t);
    t.socket().receive({ type: 'left', reason: 'taken_over' });
    expect(t.events.at(-1)).toEqual({ type: 'left', reason: 'taken_over' });
    expect(t.stored()).toBe('seat-token-1');
    t.socket().receive({ type: 'table_deleted', tableId: 'table-1' });
    expect(t.events.at(-1)).toEqual({ type: 'deleted' });
    expect(t.socket().closed).toBe(true);
    expect(t.stored()).toBeNull();
  });

  it('asks a member who is not signed in to sign in, without sending anything', async () => {
    const events: SessionEvent[] = [];
    const sockets: FakeSocket[] = [];
    const session = new TableSession({
      url: 'ws://test',
      tableId: 'table-1',
      getAccessToken: async () => null,
      socketFactory: () => {
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      },
      onEvent: (e) => events.push(e),
    });
    session.connect();
    sockets[0]!.open();
    await flush();
    expect(sockets[0]!.actions()).toEqual(['ping']);
    expect(events.at(-1)).toEqual({ type: 'error', error: { type: 'error', code: 'sign_in_required' } });
  });
});

describe('seat token storage', () => {
  it('reads the subject from a JWT-shaped token and nothing else', () => {
    expect(tokenSubject(accessTokenFor('dev-admiral'))).toBe('dev-admiral');
    expect(tokenSubject('opaque-token')).toBeNull();
    expect(tokenSubject('a.%%%.c')).toBeNull();
    expect(tokenSubject(`a.${Buffer.from('{"sub":7}').toString('base64url')}.c`)).toBeNull();
  });

  it('keys localStorage by table and member', () => {
    const items = new Map<string, string>();
    const storage = {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
    };
    const store = seatTokenStore('table-1', storage);
    store.set('dev-admiral', 'a');
    store.set('dev-captain', 'c');
    expect(store.get('dev-admiral')).toBe('a');
    expect(store.get('dev-captain')).toBe('c');
    store.clear('dev-admiral');
    expect([...items.keys()]).toEqual(['warships.seat.table-1.dev-captain']);
  });
});

describe('member requests', () => {
  it('resolves with the reply and closes, or with null when the socket fails', async () => {
    const socket = new FakeSocket();
    const reply = memberRequest('ws://test', { action: 'list_my_tables', accessToken: 'a' }, () => socket);
    socket.open();
    expect(socket.sent).toEqual([{ action: 'list_my_tables', accessToken: 'a' }]);
    socket.receive({ type: 'pong', serverTs: 1 });
    socket.receive({ type: 'my_tables', tables: [] });
    await expect(reply).resolves.toEqual({ type: 'my_tables', tables: [] });
    expect(socket.closed).toBe(true);

    const failing = new FakeSocket();
    const none = memberRequest('ws://test', {}, () => failing);
    failing.onerror?.(new Event('error'));
    await expect(none).resolves.toBeNull();
  });
});
