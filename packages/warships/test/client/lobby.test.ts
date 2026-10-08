// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableSummary } from '../../src/protocol.js';
import { primaryAction, renderLobby, renderNotice, type LobbyDeps } from '../../src/client/lobby.js';
import type { MemberReply } from '../../src/client/session.js';

const CONFIG = { webSocketUrl: 'ws://test' };

const me = { seatId: '1' as const, displayName: 'Admiral', avatarId: 12, away: false, isYou: true };
const rival = { seatId: '2' as const, displayName: 'Captain', avatarId: 40, away: false, isYou: false };

function table(overrides: Partial<TableSummary> = {}): TableSummary {
  return {
    tableId: 'table-1',
    tableName: 'Pacific',
    role: 'owner',
    status: 'waiting',
    gameNumber: 0,
    maxSeats: 2,
    seats: [me],
    createdAt: '2026-10-04T00:00:00.000Z',
    joinedAt: '2026-10-04T00:00:00.000Z',
    ...overrides,
  };
}

function deps(overrides: Partial<LobbyDeps> = {}, replies: Array<MemberReply | null> = []) {
  const request = vi.fn(async (_message: Record<string, unknown>) => replies.shift() ?? null);
  const writeText = vi.fn(async (_text: string) => {});
  const value: LobbyDeps = {
    getAccessToken: async () => 'access',
    request,
    readHint: () => null,
    origin: 'https://galaxyclass.app',
    clipboard: { writeText },
    confirm: () => true,
    ...overrides,
  };
  return { deps: value, request, writeText };
}

const myTables = (tables: TableSummary[]): MemberReply => ({ type: 'my_tables', you: { gamerTag: 'Admiral', avatarId: 12 }, tables });

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  host = document.getElementById('app')!;
});

const cards = () => [...host.querySelectorAll<HTMLElement>('.wl-card')].filter((c) => !c.classList.contains('wl-card-skeleton'));

describe('warships table list', () => {
  it('shows a signed-out visitor the members-only panel with sign-in links back to /warships', async () => {
    const { deps: d, request } = deps({ getAccessToken: async () => null });
    await renderLobby(host, CONFIG, d);
    expect(request).not.toHaveBeenCalled();
    expect(host.querySelector('.gc-game-header')?.getAttribute('data-account')).toBe('signed-out');
    const panel = host.querySelector('.wl-members')!;
    expect(panel.querySelector('h2')?.textContent).toBe('Warships is for Galaxy Class members');
    expect([...panel.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      '/sign-in?next=%2Fwarships',
      '/sign-up?next=%2Fwarships',
    ]);
    expect(host.querySelector('form')).toBeNull();
  });

  it('lists only the member’s tables, each with two seats facing off', async () => {
    const { deps: d, request } = deps({}, [
      myTables([table(), table({ tableId: 'table-2', tableName: 'Atlantic', role: 'member', seats: [rival], gameNumber: 3 })]),
    ]);
    await renderLobby(host, CONFIG, d);
    expect(request).toHaveBeenCalledWith({ action: 'list_my_tables', accessToken: 'access' });
    expect(host.querySelector('.gc-game-header-player-name')?.textContent).toBe('Admiral');
    expect(cards().map((c) => c.querySelector('h3')?.textContent)).toEqual(['Pacific', 'Atlantic']);
    expect(host.querySelector('.wl-count')?.textContent).toBe('2');
    const [first, second] = cards();
    expect(first!.querySelector('.wl-card-meta')?.textContent).toBe('1 of 2 captains · You host');
    expect(second!.querySelector('.wl-card-meta')?.textContent).toBe('1 of 2 captains · Game 3');
    expect(first!.querySelectorAll('.wl-seat')).toHaveLength(2);
    expect(first!.querySelector('.wl-versus')?.textContent).toBe('vs');
    expect(first!.querySelector('.wl-seat[data-you="true"]')?.getAttribute('aria-label')).toBe('Admiral (you)');
    expect(first!.querySelector('.wl-seat-open .wl-seat-name')?.textContent).toBe('Open seat');
    expect(second!.querySelector<HTMLAnchorElement>('.wl-btn-primary')?.getAttribute('href')).toBe('/warships/table-2');
    expect(second!.querySelector('.wl-btn-primary')?.textContent).toBe('Take a seat');
  });

  it('says what each table is doing', async () => {
    const { deps: d } = deps({}, [
      myTables([
        table({ tableId: 'a', status: 'placing', seats: [me, rival] }),
        table({ tableId: 'b', status: 'battle', role: 'member', seats: [rival] }),
        table({ tableId: 'c', status: 'finished', seats: [me, rival] }),
      ]),
    ]);
    await renderLobby(host, CONFIG, d);
    const [placing, locked, over] = cards();
    expect(placing!.querySelector('.wl-badge')?.textContent).toBe('Deploying fleets');
    expect(placing!.querySelector('.wl-btn-primary')?.textContent).toBe('Return to battle');
    expect(locked!.querySelector('.wl-badge')?.textContent).toBe('Battle under way');
    expect(locked!.querySelector('.wl-card-hint')?.textContent).toBe('Seats are locked until this battle ends.');
    expect(locked!.querySelector('.wl-seat-open[data-locked="true"] .wl-seat-name')?.textContent).toBe('Locked');
    expect(over!.querySelector('.wl-badge')?.textContent).toBe('Battle over');
    expect(over!.querySelector('.wl-btn-primary')?.textContent).toBe('Enter table');
  });

  it('copies the full share link and announces it', async () => {
    const { deps: d, writeText } = deps({}, [myTables([table()])]);
    await renderLobby(host, CONFIG, d);
    [...cards()[0]!.querySelectorAll('button')].find((b) => b.textContent === 'Copy link')!.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('https://galaxyclass.app/warships/table-1'));
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Link to Pacific copied.');
  });

  it('falls back to a selectable link when the clipboard is unavailable', async () => {
    const { deps: d } = deps({ clipboard: undefined }, [myTables([table()])]);
    await renderLobby(host, CONFIG, d);
    const card = cards()[0]!;
    [...card.querySelectorAll('button')].find((b) => b.textContent === 'Copy link')!.click();
    await vi.waitFor(() => expect(card.querySelector<HTMLElement>('.wl-invite')!.hidden).toBe(false));
    expect(document.activeElement).toBe(card.querySelector('.wl-invite-field'));
    const email = [...card.querySelectorAll('a')].find((a) => a.textContent === 'Email')!;
    expect(decodeURIComponent(email.getAttribute('href')!)).toContain('Join my Warships table “Pacific” on Galaxy Class.');
  });

  it('creates a table and puts it first with its invite open', async () => {
    const created = table({ tableId: 'new', tableName: 'Friday fleet action', seats: [] });
    const { deps: d, request } = deps({}, [myTables([table()]), { type: 'table_created', table: created }]);
    await renderLobby(host, CONFIG, d);
    expect(host.querySelector('#wl-new-help')?.textContent).toBe('Two captains per table. Share the link; placing starts when your opponent sits.');
    const input = host.querySelector<HTMLInputElement>('#wl-new-name')!;
    input.value = 'Friday fleet action';
    host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(cards()).toHaveLength(2));
    expect(request).toHaveBeenLastCalledWith({ action: 'create_table', accessToken: 'access', tableName: 'Friday fleet action' });
    expect(cards()[0]!.querySelector('h3')?.textContent).toBe('Friday fleet action');
    expect(cards()[0]!.querySelector<HTMLElement>('.wl-invite')!.hidden).toBe(false);
    expect(input.value).toBe('');
  });

  it('explains the host limit when creating is refused', async () => {
    const { deps: d } = deps({}, [myTables([]), { type: 'error', code: 'table_limit' }]);
    await renderLobby(host, CONFIG, d);
    expect(host.querySelector<HTMLElement>('.wl-empty')!.hidden).toBe(false);
    host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() =>
      expect(host.querySelector('[role="status"]')?.textContent).toBe('You already host 20 tables. Delete one to start another.'),
    );
  });

  it('lets only the host delete a table for everyone, and a guest forget it', async () => {
    const confirm = vi.fn((_text: string) => true);
    const { deps: d, request } = deps({ confirm }, [
      myTables([table({ status: 'battle', seats: [me, rival] }), table({ tableId: 'table-2', tableName: 'Atlantic', role: 'member' })]),
      { type: 'table_deleted', tableId: 'table-1' },
      { type: 'table_forgotten', tableId: 'table-2' },
    ]);
    await renderLobby(host, CONFIG, d);
    const footer = (card: HTMLElement) => card.querySelector<HTMLButtonElement>('.wl-card-footer button')!;
    expect(footer(cards()[0]!).textContent).toBe('Delete table');
    expect(footer(cards()[1]!).textContent).toBe('Remove from my tables');

    footer(cards()[0]!).click();
    await vi.waitFor(() => expect(cards()).toHaveLength(1));
    expect(confirm.mock.calls[0]![0]).toContain('The battle in progress ends now.');
    expect(request).toHaveBeenLastCalledWith({ action: 'delete_table', accessToken: 'access', tableId: 'table-1' });

    footer(cards()[0]!).click();
    await vi.waitFor(() => expect(cards()).toHaveLength(0));
    expect(request).toHaveBeenLastCalledWith({ action: 'forget_table', accessToken: 'access', tableId: 'table-2' });
    expect(host.querySelector<HTMLElement>('.wl-empty')!.hidden).toBe(false);
  });

  it('sends an expired sign-in back to the members-only panel, and offers a retry when unreachable', async () => {
    const expired = deps({}, [{ type: 'error', code: 'invalid_access_token' }]);
    await renderLobby(host, CONFIG, expired.deps);
    expect(host.querySelector('.wl-members p')?.textContent).toBe('Your sign-in has expired. Sign in again to see your tables.');

    const offline = deps({}, [null, myTables([table()])]);
    await renderLobby(host, CONFIG, offline.deps);
    expect(host.querySelector('[role="alert"] h2')?.textContent).toBe('Your tables did not load');
    [...host.querySelectorAll('button')].find((b) => b.textContent === 'Try again')!.click();
    await vi.waitFor(() => expect(cards()).toHaveLength(1));
  });

  it('renders a full-page notice under the shared header', () => {
    renderNotice(host, { title: 'Table not found', body: 'It may have been deleted.', actions: [{ label: 'Your tables', href: '/warships', primary: true }], account: null });
    expect(host.querySelector('.gc-game-header')).not.toBeNull();
    expect(host.querySelector('#wl-notice-heading')?.textContent).toBe('Table not found');
    expect(host.querySelector<HTMLAnchorElement>('.wl-notice .wl-btn-primary')?.getAttribute('href')).toBe('/warships');
  });
});

describe('primary action', () => {
  it('matches what the member can do at the table right now', () => {
    expect(primaryAction(table({ status: 'battle', seats: [me, rival] })).label).toBe('Return to battle');
    expect(primaryAction(table({ status: 'placing', seats: [me] })).label).toBe('Return to battle');
    expect(primaryAction(table({ status: 'waiting', seats: [me] })).label).toBe('Enter table');
    expect(primaryAction(table({ status: 'waiting', seats: [rival] })).label).toBe('Take a seat');
    expect(primaryAction(table({ status: 'finished', seats: [rival] })).label).toBe('Take a seat');
    expect(primaryAction(table({ status: 'finished', seats: [rival, { ...rival, seatId: '1', displayName: 'Other' }] })).label).toBe('Table full');
    expect(primaryAction(table({ status: 'battle', seats: [rival] }))).toEqual({ label: 'Game in progress', hint: 'Seats are locked until this battle ends.' });
  });
});
