// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { isTableListPath } from '../src/client/dashboard-play/route.js';
import { startDashboardPlay } from '../src/client/dashboard-play/session.js';
import type { TableListing } from '../src/client/dashboard-play/config.js';
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

async function startList(pathname: string, fetchSetup = listConfigFetch()) {
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
  await flush();
  return { root, sockets, session: await sessionPromise, fetchCalls: fetchSetup.calls };
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

  it.each(['/riffle', '/riffle/'])('renders the table list on %s', async (pathname) => {
    const { root, session, fetchCalls, sockets } = await startList(pathname);

    expect(session.phase).toBe('list');
    expect(session.tableId).toBeNull();
    expect(fetchCalls).toEqual(['/config.json']);
    expect(sockets).toEqual([]);
    expect(root.dataset.surface).toBe('table-list');
    expect(root.textContent).toContain('Open tables');
    expect(root.textContent).toContain('Galaxy Class Table');
    expect(root.textContent).toContain('$1 / $2');
    expect(root.querySelector('.table-list-status-pill')?.textContent).toBe('1 open');
    expect(root.querySelector('.table-list-join-button')?.getAttribute('href')).toBe(`/${TABLE_ID}`);
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

    const empty = await startList('/riffle', listConfigFetch([]));
    expect(empty.root.querySelectorAll('.table-list-row')).toHaveLength(0);
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
