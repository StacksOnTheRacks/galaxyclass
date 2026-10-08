// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableSummary } from '../../src/protocol.js';
import { primaryAction, renderLobby, type LobbyDeps } from '../../src/client/lobby.js';
import type { MemberReply } from '../../src/client/session.js';

const CONFIG = { webSocketUrl: 'ws://test' };

const me = { seatId: '1' as const, displayName: 'Inspector', avatarId: 12, away: false, isYou: true, suspect: 'vesper' as const };
const rival = { seatId: '2' as const, displayName: 'Sleuth', avatarId: 40, away: false, isYou: false, suspect: null };

function table(overrides: Partial<TableSummary> = {}): TableSummary {
  return {
    tableId: 'table-1',
    tableName: 'Midnight',
    role: 'owner',
    status: 'setup',
    gameNumber: 0,
    maxSeats: 6,
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

const myTables = (tables: TableSummary[]): MemberReply => ({ type: 'my_tables', you: { gamerTag: 'Inspector', avatarId: 12 }, tables });

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  host = document.getElementById('app')!;
});

const cards = () => [...host.querySelectorAll<HTMLElement>('.wdl-card')].filter((c) => !c.classList.contains('wdl-card-skeleton'));

describe('whodunit table list', () => {
  it('shows a signed-out visitor the members-only panel with sign-in links back to /whodunit', async () => {
    const { deps: d, request } = deps({ getAccessToken: async () => null });
    await renderLobby(host, CONFIG, d);
    expect(request).not.toHaveBeenCalled();
    expect(host.querySelector('.gc-game-header')?.getAttribute('data-account')).toBe('signed-out');
    const panel = host.querySelector('.wdl-members')!;
    expect(panel.querySelector('h2')?.textContent).toBe('Whodunit? is for Galaxy Class members');
    expect([...panel.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/sign-in?next=%2Fwhodunit', '/sign-up?next=%2Fwhodunit']);
    expect(host.querySelector('form')).toBeNull();
  });

  it('lists the member’s tables, each with six seats and the suspect each detective plays', async () => {
    const { deps: d, request } = deps({}, [
      myTables([table(), table({ tableId: 'table-2', tableName: 'Gaslight', role: 'member', seats: [rival], gameNumber: 3 })]),
    ]);
    await renderLobby(host, CONFIG, d);
    expect(request).toHaveBeenCalledWith({ action: 'list_my_tables', accessToken: 'access' });
    expect(cards().map((c) => c.querySelector('h3')?.textContent)).toEqual(['Midnight', 'Gaslight']);
    const [first, second] = cards();
    expect(first!.querySelector('.wdl-card-meta')?.textContent).toBe('1 of 6 detectives · You host');
    expect(second!.querySelector('.wdl-card-meta')?.textContent).toBe('1 of 6 detectives · Case 3');
    expect(first!.querySelectorAll('.wdl-seat')).toHaveLength(6);
    expect(first!.querySelector('.wdl-versus')).toBeNull();
    const mine = first!.querySelector('.wdl-seat[data-you="true"]')!;
    expect(mine.getAttribute('aria-label')).toBe('Inspector (you) as Countess Vesper');
    expect(mine.getAttribute('data-suspect')).toBe('vesper');
    expect(second!.querySelector<HTMLAnchorElement>('.wdl-btn-primary')?.getAttribute('href')).toBe('/whodunit/table-2');
    expect(second!.querySelector('.wdl-btn-primary')?.textContent).toBe('Take a seat');
  });

  it('says what each table is doing', async () => {
    const { deps: d } = deps({}, [
      myTables([
        table({ tableId: 'a', status: 'playing', seats: [me, rival] }),
        table({ tableId: 'b', status: 'playing', role: 'member', seats: [rival] }),
        table({ tableId: 'c', status: 'finished', seats: [me, rival] }),
      ]),
    ]);
    await renderLobby(host, CONFIG, d);
    const [mine, locked, over] = cards();
    expect(mine!.querySelector('.wdl-badge')?.textContent).toBe('Case under way');
    expect(mine!.querySelector('.wdl-btn-primary')?.textContent).toBe('Return to the case');
    expect(locked!.querySelector('.wdl-card-hint')?.textContent).toBe('Seats are locked until this case is closed.');
    expect(locked!.querySelector('.wdl-seat-open[data-locked="true"] .wdl-seat-name')?.textContent).toBe('Locked');
    expect(over!.querySelector('.wdl-badge')?.textContent).toBe('Case closed');
    expect(over!.querySelector('.wdl-btn-primary')?.textContent).toBe('Enter table');
  });

  it('tells the full table apart from an open one', () => {
    const full = table({
      role: 'member',
      seats: (['1', '2', '3', '4', '5', '6'] as const).map((seatId) => ({ ...rival, seatId })),
    });
    expect(primaryAction(full)).toEqual({ label: 'Table full', hint: 'All six seats are taken.' });
  });

  it('copies the full share link and announces it', async () => {
    const { deps: d, writeText } = deps({}, [myTables([table()])]);
    await renderLobby(host, CONFIG, d);
    [...cards()[0]!.querySelectorAll('button')].find((b) => b.textContent === 'Copy link')!.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('https://galaxyclass.app/whodunit/table-1'));
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Link to Midnight copied.');
  });

  it('creates a table and puts it first', async () => {
    const created = table({ tableId: 'new', tableName: 'Friday night', seats: [] });
    const { deps: d, request } = deps({}, [myTables([table()]), { type: 'table_created', table: created }]);
    await renderLobby(host, CONFIG, d);
    expect(host.querySelector('#wdl-new-help')?.textContent).toBe(
      'Three to six detectives per table. Share the link; each picks a suspect, and the host opens the case.',
    );
    const input = host.querySelector<HTMLInputElement>('#wdl-new-name')!;
    input.value = 'Friday night';
    host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(cards()).toHaveLength(2));
    expect(request).toHaveBeenLastCalledWith({ action: 'create_table', accessToken: 'access', tableName: 'Friday night' });
    expect(cards()[0]!.querySelector('h3')?.textContent).toBe('Friday night');
  });
});
