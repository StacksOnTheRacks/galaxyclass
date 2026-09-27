// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseTableIdFromPath } from '../src/client/dashboard-play/route.js';
import { startDashboardPlay } from '../src/client/dashboard-play/session.js';
import {
  TABLE_NOT_FOUND_BODY,
  TABLE_NOT_FOUND_TITLE,
} from '../src/client/dashboard-play/table-not-found.js';
import type { TableSnapshotMessage } from '../src/runtime/types.js';
import {
  configFetch,
  FakePlaySocket,
  flush,
  mountRoot,
  setViewport,
} from './support/fake-play-socket.js';

const TABLE_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const WS_URL = 'wss://example.execute-api.us-east-1.amazonaws.com/prod';

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

async function start(pathname: string, fetchSetup = configFetch()) {
  const root = mountRoot();
  const sockets: FakePlaySocket[] = [];
  const sessionPromise = startDashboardPlay({
    root,
    pathname,
    fetch: fetchSetup.fetchImpl,
    createSocket: (url) => {
      const socket = new FakePlaySocket(url);
      sockets.push(socket);
      return socket;
    },
  });
  return { root, sockets, sessionPromise, fetchCalls: fetchSetup.calls };
}

function expectTableNotFound(root: HTMLElement): void {
  const alert = root.querySelector('[role="alert"]');
  expect(alert).not.toBeNull();
  expect(alert?.getAttribute('aria-live')).toBe('assertive');
  expect(alert?.querySelector('h1')?.textContent).toBe(TABLE_NOT_FOUND_TITLE);
  expect(alert?.textContent).toContain(TABLE_NOT_FOUND_BODY);
  expect(TABLE_NOT_FOUND_TITLE).toBe("Couldn't open this table");
  expect(TABLE_NOT_FOUND_BODY).toBe('This table link is invalid or unavailable.');
  expect(root.querySelector('button')).toBeNull();
  expect(root.querySelector('input')).toBeNull();
  expect(root.textContent).not.toMatch(/Sign in|Create account|lobby|Sit at Table/i);
}

describe('parseTableIdFromPath', () => {
  it('accepts a single UUID segment with optional trailing slash, case-insensitively', () => {
    expect(parseTableIdFromPath(`/${TABLE_ID}`)).toBe(TABLE_ID);
    expect(parseTableIdFromPath(`/${TABLE_ID}/`)).toBe(TABLE_ID);
    expect(parseTableIdFromPath(`/${TABLE_ID.toUpperCase()}`)).toBe(TABLE_ID.toUpperCase());
  });

  it('accepts the galaxyclass.app/riffle table path', () => {
    expect(parseTableIdFromPath(`/riffle/${TABLE_ID}`)).toBe(TABLE_ID);
    expect(parseTableIdFromPath(`/riffle/${TABLE_ID}/`)).toBe(TABLE_ID);
  });

  it.each([
    '/',
    '',
    '/riffle',
    '/riffle/',
    '/not-a-uuid',
    `/play/${TABLE_ID}`,
    `/riffle/${TABLE_ID}/extra`,
    `/${TABLE_ID}/extra`,
    `/${TABLE_ID}//`,
    `//${TABLE_ID}`,
    '/f47ac10b58cc4372a5670e02b2c3d479',
    '/f47ac10b-58cc-4372-a567-0e02b2c3d47',
  ])('rejects %s', (pathname) => {
    expect(parseTableIdFromPath(pathname)).toBeNull();
  });
});

describe('dashboard play GUID join', () => {
  beforeEach(() => {
    setViewport(1440);
  });

  it.each([`/play/${TABLE_ID}`, `/${TABLE_ID}/extra`, '/not-a-uuid'])(
    'fails closed on %s without fetching config or opening a socket',
    async (pathname) => {
      const { root, sockets, sessionPromise, fetchCalls } = await start(pathname);
      const session = await sessionPromise;

      expect(session.phase).toBe('not_found');
      expect(fetchCalls).toEqual([]);
      expect(sockets).toEqual([]);
      expectTableNotFound(root);
    },
  );

  it('shows the loading live region before config and the socket resolve', async () => {
    let resolveConfig!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveConfig = resolve;
    });
    const fetchImpl = (() => pending) as typeof fetch;
    const { root, sockets } = await start(`/${TABLE_ID}`, { fetchImpl, calls: [] });

    const status = root.querySelector('[role="status"]');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.getAttribute('aria-busy')).toBe('true');
    expect(status?.querySelector('h1')?.textContent).toBe('Loading table…');
    expect(status?.textContent).toContain('Opening play link · no actions yet');
    expect(root.querySelector('button')).toBeNull();
    expect(sockets).toEqual([]);

    resolveConfig({ ok: true, json: async () => ({ webSocketUrl: WS_URL }) } as Response);
    await flush();
    expect(sockets).toHaveLength(1);
  });

  it('joins the seeded table from the /riffle subpath', async () => {
    const { root, sockets, sessionPromise, fetchCalls } = await start(`/riffle/${TABLE_ID}`);
    const session = await sessionPromise;

    expect(session.tableId).toBe(TABLE_ID);
    expect(fetchCalls).toEqual(['/config.json']);
    const socket = sockets[0]!;
    socket.emit('open');
    expect(socket.sent).toEqual([{ action: 'join_table', tableId: TABLE_ID }]);
    socket.receive(snapshot());
    expect(session.phase).toBe('joined');
    expect(root.dataset.surface).toBe('dashboard');
  });

  it('reads /config.json, connects to webSocketUrl, sends only join_table, and renders the dashboard shell', async () => {
    const { root, sockets, sessionPromise, fetchCalls } = await start(`/${TABLE_ID}/`);
    const session = await sessionPromise;

    expect(fetchCalls).toEqual(['/config.json']);
    expect(sockets).toHaveLength(1);
    const socket = sockets[0]!;
    expect(socket.url).toBe(WS_URL);

    socket.emit('open');
    expect(socket.sent).toEqual([{ action: 'join_table', tableId: TABLE_ID }]);

    expect(root.dataset.surface).toBe('loading');
    socket.receive(snapshot());

    expect(session.phase).toBe('joined');
    expect(root.dataset.surface).toBe('dashboard');
    for (const region of ['top-bar', 'player-row', 'my-hand', 'board', 'actions']) {
      expect(root.querySelector(`[data-region="${region}"]`)).not.toBeNull();
    }
    expect(root.textContent).toContain('$1 / $2');
    expect(socket.actions()).toEqual(['join_table']);
    expect(socket.actions()).not.toContain('create_table');
    expect(socket.actions()).not.toContain('sit');
  });

  it('fails closed when the server answers table_not_found', async () => {
    const { root, sockets, sessionPromise } = await start(`/${TABLE_ID}`);
    const session = await sessionPromise;
    const socket = sockets[0]!;
    socket.emit('open');
    socket.receive({ type: 'error', code: 'table_not_found' });

    expect(session.phase).toBe('not_found');
    expect(socket.closed).toBe(true);
    expectTableNotFound(root);
  });

  it('fails closed on any unsuccessful join', async () => {
    const { root, sockets, sessionPromise } = await start(`/${TABLE_ID}`);
    await sessionPromise;
    sockets[0]!.emit('open');
    sockets[0]!.receive({ type: 'error', code: 'version_conflict' });
    expectTableNotFound(root);
  });

  it.each([
    ['missing config', configFetch({}, { ok: false })],
    ['network failure', configFetch({}, { reject: true })],
    ['config without webSocketUrl', configFetch({ url: WS_URL })],
    ['config with a non-websocket url', configFetch({ webSocketUrl: 'https://evil.example' })],
  ])('fails closed on %s without opening a socket', async (_label, fetchSetup) => {
    const { root, sockets, sessionPromise } = await start(`/${TABLE_ID}`, fetchSetup);
    await sessionPromise;
    expect(sockets).toEqual([]);
    expectTableNotFound(root);
  });

  it.each(['error', 'close'] as const)('fails closed on WebSocket %s before join', async (event) => {
    const { root, sockets, sessionPromise } = await start(`/${TABLE_ID}`);
    await sessionPromise;
    sockets[0]!.emit(event);
    expectTableNotFound(root);
    expect(sockets[0]!.sent).toEqual([]);
  });

  it('ignores snapshots for a different table', async () => {
    const { root, sockets, sessionPromise } = await start(`/${TABLE_ID}`);
    const session = await sessionPromise;
    sockets[0]!.emit('open');
    sockets[0]!.receive(snapshot({ tableId: '00000000-0000-4000-8000-000000000000' }));
    expect(session.phase).toBe('loading');
    expect(root.dataset.surface).toBe('loading');
  });

  it('ships a bundle with no bootstrap redeem, match HTTP, or create_table path', () => {
    const bundle = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../public/dashboard/dashboard-play.js'),
      'utf8',
    );
    expect(bundle).toContain('join_table');
    expect(bundle).not.toMatch(/create_table|\/v1\/play\/matches|\/v1\/bootstrap|bootstrapToken/);
  });

  it('renders the same surfaces at the narrow-iframe breakpoint', async () => {
    setViewport(390, 844);
    const joined = await start(`/${TABLE_ID}`);
    await joined.sessionPromise;
    joined.sockets[0]!.emit('open');
    joined.sockets[0]!.receive(snapshot());
    expect(joined.root.dataset.breakpoint).toBe('phone');
  });
});
