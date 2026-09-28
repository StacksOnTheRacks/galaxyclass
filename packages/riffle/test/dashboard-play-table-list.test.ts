// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isTableListPath } from '../src/client/dashboard-play/route.js';
import { startDashboardPlay, type DashboardPlaySession } from '../src/client/dashboard-play/session.js';
import type { TableListing } from '../src/client/dashboard-play/config.js';
import { renderTableList } from '../src/client/dashboard-play/table-list.js';
import { ACCOUNT_HINT_KEY, type AccountStorage } from '../src/client/dashboard-play/studio-account.js';
import { configFetch, FakePlaySocket, flush, mountRoot, setViewport } from './support/fake-play-socket.js';

const TABLE_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const WS_URL = 'wss://example.execute-api.us-east-1.amazonaws.com/prod';

const SAMPLE_TABLE: TableListing = {
  id: TABLE_ID,
  name: 'Galaxy Class Table',
  hostLabel: 'Hosted by Galaxy Class',
  variantLabel: "No-Limit Hold'em",
  blindsLabel: '$1 / $2',
  buyInLabel: 'Buy-in $2,000',
  maxSeats: 8,
};

function listConfigFetch(tables: unknown = [SAMPLE_TABLE]) {
  return configFetch({ webSocketUrl: WS_URL, tables });
}

function accountStorage(entries: Record<string, string> = {}): AccountStorage {
  return { getItem: (key) => entries[key] ?? null };
}

function signedInStorage(email: string): AccountStorage {
  return accountStorage({ [ACCOUNT_HINT_KEY]: JSON.stringify({ email }) });
}

const openSessions: DashboardPlaySession[] = [];

async function startList(
  pathname: string,
  fetchSetup = listConfigFetch(),
  storage: AccountStorage = accountStorage(),
) {
  const root = mountRoot();
  const sockets: FakePlaySocket[] = [];
  const sessionPromise = startDashboardPlay({
    root,
    pathname,
    fetch: fetchSetup.fetchImpl,
    accountStorage: storage,
    createSocket: (url) => {
      const socket = new FakePlaySocket(url);
      sockets.push(socket);
      return socket;
    },
  });
  await flush();
  const session = await sessionPromise;
  openSessions.push(session);
  return { root, sockets, session, fetchCalls: fetchSetup.calls };
}

describe('isTableListPath', () => {
  it.each(['/riffle', '/riffle/', '/'])('accepts %s', (pathname) => {
    expect(isTableListPath(pathname)).toBe(true);
  });

  it.each(['/not-a-uuid', `/riffle/${TABLE_ID}`, `/${TABLE_ID}`])('rejects %s', (pathname) => {
    expect(isTableListPath(pathname)).toBe(false);
  });
});

describe('dashboard play table list', () => {
  beforeEach(() => {
    setViewport(1280);
  });

  afterEach(() => {
    while (openSessions.length > 0) {
      openSessions.pop()?.dispose();
    }
  });

  it.each(['/riffle', '/riffle/'])('renders the table list on %s', async (pathname) => {
    const { root, session, fetchCalls, sockets } = await startList(pathname);

    expect(session.phase).toBe('list');
    expect(session.tableId).toBeNull();
    expect(fetchCalls).toEqual(['/config.json']);
    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.url).toBe(WS_URL);
    expect(root.dataset.surface).toBe('table-list');
    expect(root.textContent).toContain('Open tables');
    expect(root.textContent).toContain('Galaxy Class Table');
    expect(root.textContent).toContain('$1 / $2');
    expect(root.querySelector('.table-list-status-pill')?.textContent).toBe('1 open');
    expect(root.querySelector('.table-list-join-button')?.getAttribute('href')).toBe(`/${TABLE_ID}`);
    expect(root.querySelector('.table-list-player-count')?.textContent).toBe('0 / 8');
  });

  it('asks the runtime for seated counts and paints them on the list', async () => {
    const { root, sockets } = await startList('/riffle');
    const socket = sockets[0]!;

    socket.emit('open');
    expect(socket.sent).toEqual([{ action: 'list_tables', tableIds: [TABLE_ID] }]);
    expect(socket.actions()).not.toContain('join_table');

    socket.receive({
      type: 'table_list',
      tables: [{ tableId: TABLE_ID, seatedCount: 2, maxSeats: 8 }],
    });

    const counts = Array.from(root.querySelectorAll('.table-list-player-count'), (node) => node.textContent);
    expect(counts).toContain('2 / 8');
    expect(counts).toContain('2 / 8 seated');
    expect(root.querySelectorAll('.table-list-row .table-list-seat-filled')).toHaveLength(2);
    expect(root.querySelectorAll('.table-list-row .table-list-seat-open')).toHaveLength(6);
  });

  it('renders seated occupancy when the list is painted with live counts', () => {
    const root = mountRoot();
    renderTableList(root, [SAMPLE_TABLE], null, { [TABLE_ID]: 2 });
    expect(root.querySelector('.table-list-player-count')?.textContent).toBe('2 / 8');
    expect(root.querySelectorAll('.table-list-row .table-list-seat-filled')).toHaveLength(2);
    expect(root.querySelectorAll('.table-list-row .table-list-seat-open')).toHaveLength(6);
  });

  it('labels every join control Join', async () => {
    setViewport(834);
    const { root } = await startList('/riffle');
    const labels = Array.from(root.querySelectorAll('.table-list-join-button'), (link) => link.textContent);
    expect(labels.length).toBeGreaterThan(1);
    expect(new Set(labels)).toEqual(new Set(['Join']));
  });

  it('shows Guest when no studio account is signed in', async () => {
    const { root } = await startList('/riffle');
    expect(root.querySelector('.table-list-playing-as')?.getAttribute('data-account')).toBe('guest');
    expect(root.querySelector('.table-list-playing-as-name')?.textContent).toBe('Guest');
    expect(root.querySelector('.table-list-subtitle')?.textContent).toContain('play as a guest');
  });

  it('shows the signed-in studio account instead of Guest', async () => {
    const { root } = await startList('/riffle', listConfigFetch(), signedInStorage('maya@example.com'));
    expect(root.querySelector('.table-list-playing-as')?.getAttribute('data-account')).toBe('signed-in');
    expect(root.querySelector('.table-list-playing-as-name')?.textContent).toBe('maya@example.com');
    expect(root.querySelector('.table-list-guest-avatar')?.textContent).toBe('M');
    expect(root.querySelector('.table-list-subtitle')?.textContent).not.toContain('guest');
  });

  it('stays Guest when the account hint is malformed', async () => {
    const { root } = await startList(
      '/riffle',
      listConfigFetch(),
      accountStorage({ [ACCOUNT_HINT_KEY]: '{"email":' }),
    );
    expect(root.querySelector('.table-list-playing-as-name')?.textContent).toBe('Guest');
  });

  it('renders inert controls with aria-disabled', async () => {
    const { root } = await startList('/riffle');

    const inertControls = root.querySelectorAll('[aria-disabled="true"]');
    expect(inertControls.length).toBeGreaterThan(0);
    inertControls.forEach((control) => {
      control.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(root.dataset.surface).toBe('table-list');
    expect(root.querySelector('.table-list-join-button')).not.toBeNull();
  });

  it('drops malformed table entries and renders an empty list shell', async () => {
    const { root } = await startList(
      '/riffle',
      listConfigFetch([
        { id: 'bad-id', name: 'Broken' },
        { ...SAMPLE_TABLE, maxSeats: 0 },
        SAMPLE_TABLE,
        null,
      ]),
    );

    expect(root.querySelectorAll('.table-list-row')).toHaveLength(1);
    expect(root.querySelector('.table-list-status-pill')?.textContent).toBe('1 open');
  });

  it('renders zero rows when tables is missing or empty', async () => {
    const missing = await startList('/riffle', configFetch({ webSocketUrl: WS_URL }));
    expect(missing.root.querySelectorAll('.table-list-row')).toHaveLength(0);
    expect(missing.root.querySelector('.table-list-status-pill')?.textContent).toBe('0 open');
    expect(missing.sockets).toEqual([]);

    const empty = await startList('/riffle', listConfigFetch([]));
    expect(empty.root.querySelectorAll('.table-list-row')).toHaveLength(0);
    expect(empty.sockets).toEqual([]);
  });

  it('fails closed when config cannot be loaded', async () => {
    const { root, session } = await startList('/riffle', configFetch({}, { ok: false }));
    expect(session.phase).toBe('not_found');
    expect(root.dataset.surface).toBe('table-not-found');
  });

  it('shows responsive card layout at tablet width', async () => {
    setViewport(834);
    const { root } = await startList('/riffle');
    expect(root.querySelector('.table-list-grid')).not.toBeNull();
    expect(root.querySelector('.table-list-card')).not.toBeNull();
  });
});
