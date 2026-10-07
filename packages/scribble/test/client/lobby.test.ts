// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { primaryAction, renderLobby, type LobbyDeps } from '../../src/client/lobby.js';
import type { MemberReply } from '../../src/client/session.js';
import type { TableSummary } from '../../src/runtime/types.js';

const CONFIG = { webSocketUrl: 'ws://test' };

function table(overrides: Partial<TableSummary> = {}): TableSummary {
  return {
    tableId: 'table-1',
    tableName: 'Inkwell',
    role: 'owner',
    status: 'waiting',
    gameNumber: 0,
    maxSeats: 4,
    seats: [{ seatId: '1', displayName: 'WordSmith', avatarId: 12, away: false, isYou: true }],
    createdAt: '2026-10-04T00:00:00.000Z',
    joinedAt: '2026-10-04T00:00:00.000Z',
    ...overrides,
  };
}

function deps(overrides: Partial<LobbyDeps> = {}, replies: Array<MemberReply | null> = []) {
  const request = vi.fn(async () => replies.shift() ?? null);
  const writeText = vi.fn(async () => {});
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

const myTables = (tables: TableSummary[]): MemberReply => ({
  type: 'my_tables',
  you: { gamerTag: 'WordSmith', avatarId: 12 },
  tables,
});

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  host = document.getElementById('app')!;
});

const cards = () => [...host.querySelectorAll<HTMLElement>('.sl-card')].filter((c) => !c.classList.contains('sl-card-skeleton'));

describe('scribble table list', () => {
  it('shows a signed-out visitor the members-only panel with sign-in links back to /scribble', async () => {
    const { deps: d, request } = deps({ getAccessToken: async () => null });
    await renderLobby(host, CONFIG, d);
    expect(request).not.toHaveBeenCalled();
    expect(host.querySelector('.gc-game-header')?.getAttribute('data-account')).toBe('signed-out');
    expect(host.querySelector('.gc-game-header-back')?.getAttribute('href')).toBe('/');
    const panel = host.querySelector('.sl-members')!;
    expect(panel.querySelector('h2')?.textContent).toBe('Scribble is for Galaxy Class members');
    expect([...panel.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      '/sign-in?next=%2Fscribble',
      '/sign-up?next=%2Fscribble',
    ]);
    expect(host.querySelector('form')).toBeNull();
  });

  it('lists only the member’s tables, with the header showing their verified gamer tag', async () => {
    const { deps: d, request } = deps({}, [myTables([table(), table({ tableId: 'table-2', tableName: 'Margins', role: 'member', seats: [] })])]);
    await renderLobby(host, CONFIG, d);
    expect(request).toHaveBeenCalledWith({ action: 'list_my_tables', accessToken: 'access' });
    expect(host.querySelector('.gc-game-header-player-name')?.textContent).toBe('WordSmith');
    expect(cards().map((c) => c.querySelector('h3')?.textContent)).toEqual(['Inkwell', 'Margins']);
    expect(host.querySelector('.sl-count')?.textContent).toBe('2');
    expect(cards()[0]!.querySelector('.sl-card-meta')?.textContent).toBe('1 of 4 seated · You host');
    expect(cards()[0]!.querySelectorAll('.sl-seat')).toHaveLength(4);
    expect(cards()[0]!.querySelector('.sl-seat[data-you="true"]')?.getAttribute('aria-label')).toBe('WordSmith (you)');
    expect(cards()[1]!.querySelector<HTMLAnchorElement>('.sl-btn-primary')?.getAttribute('href')).toBe('/scribble/table-2');
  });

  it('says what each table is doing and locks seats for a game in progress', async () => {
    const playing = table({ tableId: 'p', status: 'playing', role: 'member', seats: [{ seatId: '1', displayName: 'A', avatarId: 1, away: false, isYou: false }] });
    const { deps: d } = deps({}, [myTables([playing, table({ tableId: 'e', status: 'ended' })])]);
    await renderLobby(host, CONFIG, d);
    const [first, second] = cards();
    expect(first!.dataset.status).toBe('playing');
    expect(first!.querySelector('.sl-badge')?.textContent).toBe('Game in progress');
    expect(first!.querySelector('.sl-btn-primary')?.textContent).toBe('Watch game');
    expect(first!.querySelector('.sl-card-hint')?.textContent).toBe('Seats are locked until this game ends.');
    expect(first!.querySelectorAll('.sl-seat-open[data-locked="true"]')).toHaveLength(3);
    expect(second!.querySelector('.sl-badge')?.textContent).toBe('Game over');
  });

  it('copies the full invite link and announces it', async () => {
    const { deps: d, writeText } = deps({}, [myTables([table()])]);
    await renderLobby(host, CONFIG, d);
    const copy = [...cards()[0]!.querySelectorAll('button')].find((b) => b.textContent === 'Copy link')!;
    copy.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('https://galaxyclass.app/scribble/table-1'));
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Link to Inkwell copied.');
  });

  it('falls back to a selectable link when the clipboard is unavailable', async () => {
    const { deps: d } = deps({ clipboard: undefined }, [myTables([table()])]);
    await renderLobby(host, CONFIG, d);
    const card = cards()[0]!;
    [...card.querySelectorAll('button')].find((b) => b.textContent === 'Copy link')!.click();
    await vi.waitFor(() => expect(card.querySelector<HTMLElement>('.sl-invite')!.hidden).toBe(false));
    expect(document.activeElement).toBe(card.querySelector('.sl-invite-field'));
    expect(card.querySelector('[aria-controls$="-invite"]')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('opens an invite panel with the link and an email invite', async () => {
    const { deps: d } = deps({}, [myTables([table()])]);
    await renderLobby(host, CONFIG, d);
    const card = cards()[0]!;
    const toggle = card.querySelector<HTMLButtonElement>('[aria-controls$="-invite"]')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(card.querySelector<HTMLInputElement>('.sl-invite-field')?.value).toBe('https://galaxyclass.app/scribble/table-1');
    const email = [...card.querySelectorAll('a')].find((a) => a.textContent === 'Email')!;
    expect(decodeURIComponent(email.getAttribute('href')!)).toContain('https://galaxyclass.app/scribble/table-1');
  });

  it('creates a table and puts it first with its invite panel open', async () => {
    const created = table({ tableId: 'new', tableName: 'Friday word night', seats: [] });
    const { deps: d, request } = deps({}, [myTables([table()]), { type: 'table_created', table: created }]);
    await renderLobby(host, CONFIG, d);
    const input = host.querySelector<HTMLInputElement>('#sl-new-name')!;
    expect(host.querySelector('label[for="sl-new-name"]')?.textContent).toBe('Table name');
    input.value = 'Friday word night';
    host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(cards()).toHaveLength(2));
    expect(request).toHaveBeenLastCalledWith({ action: 'create_table', accessToken: 'access', tableName: 'Friday word night' });
    expect(cards()[0]!.querySelector('h3')?.textContent).toBe('Friday word night');
    expect(cards()[0]!.querySelector<HTMLElement>('.sl-invite')!.hidden).toBe(false);
    expect(input.value).toBe('');
  });

  it('explains the host limit when creating is refused', async () => {
    const { deps: d } = deps({}, [myTables([]), { type: 'error', code: 'table_limit' }]);
    await renderLobby(host, CONFIG, d);
    host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() =>
      expect(host.querySelector('[role="status"]')?.textContent).toBe('You already host 20 tables. Delete one to start another.'),
    );
  });

  it('shows an empty state, and removes a table after confirming', async () => {
    const confirm = vi.fn((_text: string) => true);
    const { deps: d, request } = deps({ confirm }, [
      myTables([table({ role: 'member' })]),
      { type: 'table_forgotten', tableId: 'table-1' },
    ]);
    await renderLobby(host, CONFIG, d);
    expect(host.querySelector<HTMLElement>('.sl-empty')!.hidden).toBe(true);
    [...cards()[0]!.querySelectorAll('button')].find((b) => b.textContent === 'Remove from my tables')!.click();
    await vi.waitFor(() => expect(cards()).toHaveLength(0));
    expect(confirm.mock.calls[0]![0]).toContain('You keep your seat');
    expect(request).toHaveBeenLastCalledWith({ action: 'forget_table', accessToken: 'access', tableId: 'table-1' });
    expect(host.querySelector<HTMLElement>('.sl-empty')!.hidden).toBe(false);
  });

  it('lets only the host delete a table for everyone, after confirming', async () => {
    const confirm = vi.fn((_text: string) => true);
    const { deps: d, request } = deps({ confirm }, [
      myTables([table({ status: 'playing' }), table({ tableId: 'table-2', tableName: 'Margins', role: 'member' })]),
      { type: 'table_deleted', tableId: 'table-1' },
    ]);
    await renderLobby(host, CONFIG, d);
    const [hosted, joined] = cards();
    const buttonLabels = (card: HTMLElement) => [...card.querySelectorAll('.sl-card-footer button')].map((b) => b.textContent);
    expect(buttonLabels(hosted!)).toEqual(['Delete table']);
    expect(buttonLabels(joined!)).toEqual(['Remove from my tables']);

    hosted!.querySelector<HTMLButtonElement>('.sl-card-footer button')!.click();
    await vi.waitFor(() => expect(cards()).toHaveLength(1));
    expect(confirm.mock.calls[0]![0]).toBe(
      'Delete “Inkwell” for everyone? The game in progress ends now. Every seat and invite link stops working. This cannot be undone.',
    );
    expect(request).toHaveBeenLastCalledWith({ action: 'delete_table', accessToken: 'access', tableId: 'table-1' });
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Inkwell deleted.');
  });

  it('keeps the table when the host cancels, or when the server refuses the delete', async () => {
    const confirm = vi.fn((_text: string) => false);
    const { deps: d, request } = deps({ confirm }, [myTables([table()]), { type: 'error', code: 'not_table_host' }]);
    await renderLobby(host, CONFIG, d);
    const remove = () => cards()[0]!.querySelector<HTMLButtonElement>('.sl-card-footer button')!;
    remove().click();
    expect(request).toHaveBeenCalledTimes(1);
    expect(cards()).toHaveLength(1);

    confirm.mockReturnValue(true);
    remove().click();
    await vi.waitFor(() => expect(host.querySelector('[role="status"]')?.textContent).toBe('Could not delete Inkwell. Try again.'));
    expect(cards()).toHaveLength(1);
    expect(remove().disabled).toBe(false);
  });

  it('sends an expired sign-in back to the members-only panel', async () => {
    const { deps: d } = deps({}, [{ type: 'error', code: 'invalid_access_token' }]);
    await renderLobby(host, CONFIG, d);
    expect(host.querySelector('.sl-members p')?.textContent).toBe('Your sign-in has expired. Sign in again to see your tables.');
    expect(host.querySelector('.gc-game-header')?.getAttribute('data-account')).toBe('signed-out');
  });

  it('offers a retry when the server cannot be reached', async () => {
    const { deps: d, request } = deps({}, [null, myTables([table()])]);
    await renderLobby(host, CONFIG, d);
    const retry = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Try again')!;
    expect(host.querySelector('[role="alert"] h2')?.textContent).toBe('Your tables did not load');
    retry.click();
    await vi.waitFor(() => expect(cards()).toHaveLength(1));
    expect(request).toHaveBeenCalledTimes(2);
  });
});

describe('primary action', () => {
  const seated = { seatId: '1', displayName: 'Me', avatarId: 1, away: false, isYou: true };
  const other = { seatId: '1', displayName: 'Them', avatarId: 1, away: false, isYou: false };
  it('matches what the member can do at the table right now', () => {
    expect(primaryAction(table({ status: 'playing', seats: [seated] })).label).toBe('Return to game');
    expect(primaryAction(table({ status: 'waiting', seats: [seated] })).label).toBe('Enter table');
    expect(primaryAction(table({ status: 'waiting', seats: [other] })).label).toBe('Take a seat');
    expect(primaryAction(table({ status: 'ended', seats: [other] })).label).toBe('Take a seat');
    expect(primaryAction(table({ status: 'waiting', seats: Array.from({ length: 4 }, (_, i) => ({ ...other, seatId: String(i + 1) })) })).label).toBe(
      'Watch table',
    );
    expect(primaryAction(table({ status: 'playing', seats: [other] })).label).toBe('Watch game');
  });
});
