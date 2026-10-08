import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_SUPPLIED_STATE_KEYS } from '../../src/protocol.js';
import { TableSession, type SeatTokenStore, type SessionEvent, type SocketFactory } from '../../src/client/session.js';
import { seatTokenStore } from '../../src/client/table-app.js';
import { eventMessage, setupSnapshot, snapshot } from './support.js';

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
  const sub = options.sub ?? 'sub-inspector';
  const profile = options.profile ?? sharedStore();
  if (options.stored) {
    profile.tokens.set(sub, options.stored);
  }
  const session = new TableSession({
    url: 'ws://test',
    tableId: 'table-1',
    getAccessToken: async () => accessTokenFor(sub),
    seatStore: profile.store,
    socketFactory: factory,
    now: () => 1_000,
    onEvent: (event) => events.push(event),
  });
  return { session, sockets, events, socket: () => sockets.at(-1)!, stored: () => profile.tokens.get(sub) ?? null };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Joins, receives a setup snapshot with an open seat, and sits as seat 1. */
async function seated(t: ReturnType<typeof setup>) {
  t.session.connect();
  t.socket().open();
  await flush();
  t.socket().receive(setupSnapshot({ you: null }));
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
    expect(t.socket().sent[1]).toEqual({ action: 'join_table', tableId: 'table-1', accessToken: accessTokenFor('sub-inspector') });
    expect(t.stored()).toBe('seat-token-1');
    expect(t.session.seated).toBe(true);
    expect(t.session.memberId).toBe('sub-inspector');
  });

  it('passes events for this table straight through, ahead of the snapshot that includes them', async () => {
    const t = setup();
    await seated(t);
    const message = eventMessage({ kind: 'rolled', seatId: '1', dice: [2, 5] });
    t.socket().receive(message);
    t.socket().receive({ ...message, tableId: 'other' });
    expect(t.events.filter((e) => e.type === 'event')).toEqual([{ type: 'event', message }]);
  });

  it('sends only rules input with the seat token, never client-supplied state', async () => {
    const t = setup();
    await seated(t);
    t.session.chooseSuspect('juniper');
    t.session.ready();
    t.session.startGame();
    t.session.roll();
    t.session.move({ kind: 'hall', x: 7, y: 3, path: [], steps: 3 } as never);
    t.session.move({ kind: 'room', room: 'parlor', dice: [6, 6] } as never);
    t.session.suggest('rook', 'vial');
    t.session.showCard('rook');
    t.session.accuse('duarte', 'bust', 'foyer');
    t.session.endTurn();
    t.session.takePassage();
    const actions = t.socket().sent.slice(3);
    expect(actions.map((m) => m.action)).toEqual([
      'choose_suspect',
      'ready',
      'start_game',
      'roll',
      'move',
      'move',
      'suggest',
      'show_card',
      'accuse',
      'end_turn',
      'take_passage',
    ]);
    expect(actions.every((m) => m.seatToken === 'seat-token-1')).toBe(true);
    expect(actions[4]!.to).toEqual({ kind: 'hall', x: 7, y: 3 });
    expect(actions[5]!.to).toEqual({ kind: 'room', room: 'parlor' });
    for (const message of actions) {
      for (const key of CLIENT_SUPPLIED_STATE_KEYS) {
        expect(message).not.toHaveProperty(key);
      }
    }
  });

  it('resumes a held seat with the stored token after a reload', async () => {
    const t = setup({ stored: 'held-token' });
    t.session.connect();
    t.socket().open();
    await flush();
    t.socket().receive(snapshot({ you: null }));
    expect(t.socket().sent.at(-1)).toEqual({ action: 'resume', seatToken: 'held-token' });
  });

  it('sits fresh when the stored token went stale', async () => {
    const t = setup({ stored: 'stale-token' });
    t.session.connect();
    t.socket().open();
    await flush();
    t.socket().receive(setupSnapshot({ you: null }));
    t.socket().receive({ type: 'error', code: 'invalid_seat_token' });
    await flush();
    expect(t.stored()).toBeNull();
    expect(t.socket().actions().at(-1)).toBe('sit');
    expect(t.events.some((e) => e.type === 'error')).toBe(false);
  });

  it('waits out a locked case, then takes a seat once it closes', async () => {
    const t = setup();
    t.session.connect();
    t.socket().open();
    await flush();
    t.socket().receive(snapshot({ you: null }));
    await flush();
    t.socket().receive({ type: 'error', code: 'table_locked' });
    t.socket().receive(snapshot({ you: null, version: 2 }));
    await flush();
    expect(t.socket().actions().filter((a) => a === 'sit')).toHaveLength(1);
    t.socket().receive(snapshot({ you: null, version: 3, status: 'finished' }));
    await flush();
    expect(t.socket().actions().filter((a) => a === 'sit')).toHaveLength(2);
  });

  it('samples the clock every minute during a case only', async () => {
    const t = setup();
    await seated(t);
    t.socket().receive(snapshot());
    const pings = () => t.socket().actions().filter((a) => a === 'ping').length;
    const before = pings();
    vi.advanceTimersByTime(60_000);
    expect(pings()).toBe(before + 1);
    t.socket().receive(snapshot({ status: 'finished' }));
    vi.advanceTimersByTime(120_000);
    expect(pings()).toBe(before + 1);
  });

  it('reports the dropped connection and reconnects', async () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    const t = setup();
    await vi.waitFor(async () => {
      t.session.connect();
      t.socket().open();
    });
    t.socket().drop();
    expect(t.events.filter((e) => e.type === 'status').map((e) => (e as { status: string }).status)).toEqual(['connecting', 'open', 'closed']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.sockets).toHaveLength(2);
    t.session.close();
  });

  it('keeps seat tokens per table and per member', () => {
    const items = new Map<string, string>();
    const storage = {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
    };
    const store = seatTokenStore('table-1', storage);
    store.set('sub-a', 'token-a');
    expect(items.get('whodunit.seat.table-1.sub-a')).toBe('token-a');
    expect(store.get('sub-b')).toBeNull();
    store.clear('sub-a');
    expect(store.get('sub-a')).toBeNull();
  });
});
