import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeHandler } from '../../src/runtime/handler.js';
import { loadDictionary } from '../../src/rules/dictionary.js';
import { MemoryScribbleStore } from '../../src/runtime/memory-store.js';
import { MAX_OWNED_TABLES, sanitizeTableName } from '../../src/runtime/tables.js';
import type { TableSummary } from '../../src/runtime/types.js';
import { attackerKey, signAccessToken } from '../support/cognito-tokens.js';
import { Harness, TABLE_ID } from '../support/runtime-harness.js';

let h: Harness;
beforeEach(async () => {
  h = new Harness();
  await h.seed({ visibility: 'private', listed: false, createdBy: 'sub-word-smith' });
});
afterEach(() => vi.restoreAllMocks());

const WORD_SMITH = () => signAccessToken();

async function myTables(conn: string, accessToken: string): Promise<TableSummary[]> {
  await h.send(conn, { action: 'list_my_tables', accessToken });
  return h.last(conn, 'my_tables').tables;
}

describe('members only', () => {
  it('refuses to show a table without a member sign-in, and never binds the connection', async () => {
    await h.connect('anon');
    await h.send('anon', { action: 'join_table', tableId: TABLE_ID });
    expect(h.lastError('anon')).toEqual({ type: 'error', code: 'sign_in_required' });
    await h.send('anon', { action: 'join_table', tableId: TABLE_ID, accessToken: signAccessToken({}, attackerKey) });
    expect(h.lastError('anon')).toEqual({ type: 'error', code: 'invalid_access_token' });
    expect(h.messages('anon').some((m) => m.type === 'table_snapshot')).toBe(false);
    expect(h.store.connections.get('anon')?.tableId).toBeUndefined();

    await h.send('anon', { action: 'check_words', words: ['CAT'] });
    expect(h.lastError('anon')).toEqual({ type: 'error', code: 'not_table_member' });
  });

  it('checks the sign-in before saying whether a table exists', async () => {
    await h.connect('anon');
    await h.send('anon', { action: 'join_table', tableId: '00000000-0000-4000-8000-000000000000' });
    expect(h.lastError('anon')).toEqual({ type: 'error', code: 'sign_in_required' });
  });

  it('refuses every table-manager action without a member sign-in', async () => {
    await h.connect('anon');
    for (const action of ['list_my_tables', 'create_table', 'forget_table', 'delete_table']) {
      await h.send('anon', { action, tableId: TABLE_ID });
      expect(h.lastError('anon')).toEqual({ type: 'error', code: 'sign_in_required' });
    }
    expect(h.store.tables.size).toBe(1);
  });

  it('turns everyone away when the runtime cannot verify sign-ins', async () => {
    const store = new MemoryScribbleStore();
    const sent: unknown[] = [];
    const handler = createRuntimeHandler({
      store,
      dictionary: loadDictionary(),
      resolvePlayer: null,
      postToConnection: async (_id, message) => {
        sent.push(message);
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const event = (body: unknown) => ({
      requestContext: { routeKey: '$default', connectionId: 'c', domainName: 'x', stage: 'prod' },
      body: JSON.stringify(body),
    });
    await handler({ requestContext: { routeKey: '$connect', connectionId: 'c', domainName: 'x', stage: 'prod' } });
    await handler(event({ action: 'join_table', tableId: TABLE_ID, accessToken: WORD_SMITH() }));
    expect(sent.at(-1)).toEqual({ type: 'error', code: 'identity_unavailable' });
  });
});

describe('member table manager', () => {
  it('creates a private table owned by the member and lists it first', async () => {
    await h.connect('m');
    await h.send('m', { action: 'create_table', accessToken: WORD_SMITH(), tableName: '  Friday\n word   night  ' });
    const created = h.last('m', 'table_created').table;
    expect(created).toMatchObject({
      tableName: 'Friday word night',
      role: 'owner',
      status: 'waiting',
      maxSeats: 4,
      seats: [],
      gameNumber: 0,
    });
    const stored = h.store.tables.get(created.tableId)!;
    expect(stored).toMatchObject({ visibility: 'private', listed: false, createdBy: 'sub-word-smith' });

    const tables = await myTables('m', WORD_SMITH());
    expect(tables.map((t) => t.tableId)).toEqual([created.tableId]);
    expect(h.last('m', 'my_tables').you).toEqual({ gamerTag: 'WordSmith', avatarId: 12 });
  });

  it('names an unnamed table after its host', async () => {
    await h.connect('m');
    await h.send('m', { action: 'create_table', accessToken: WORD_SMITH() });
    expect(h.last('m', 'table_created').table.tableName).toBe("WordSmith's table");
  });

  it('adds a table to a member’s list when they open its link, keeping the host as owner', async () => {
    await h.seat('friend');
    const friend = await myTables('friend', h.tokenFor('friend'));
    expect(friend).toHaveLength(1);
    expect(friend[0]).toMatchObject({ tableId: TABLE_ID, role: 'member', tableName: 'Inkwell' });
    expect(friend[0]!.seats).toEqual([
      { seatId: '1', displayName: expect.any(String), avatarId: expect.any(Number), away: false, isYou: true },
    ]);

    await h.connect('host');
    await h.join('host', TABLE_ID, WORD_SMITH());
    const host = await myTables('host', WORD_SMITH());
    expect(host[0]).toMatchObject({ tableId: TABLE_ID, role: 'owner' });
    expect(host[0]!.seats[0]!.isYou).toBe(false);
  });

  it('shows each table’s status and never leaks subs or seat tokens', async () => {
    const tokenA = await h.seat('a', { accessToken: WORD_SMITH() });
    await h.seat('b');
    await h.send('a', { action: 'start_game', seatToken: tokenA });
    const tables = await myTables('b', h.tokenFor('b'));
    expect(tables[0]).toMatchObject({ status: 'playing', gameNumber: 1 });
    const frame = (h.wire.get('b') ?? []).at(-1)!;
    expect(frame).not.toMatch(/sub-|seatToken|playerSub|connectionId/);
    expect(frame).not.toContain(tokenA);
  });

  it('forgets a table from one member’s list without touching the table or their seat', async () => {
    await h.seat('a');
    await h.send('a', { action: 'forget_table', accessToken: h.tokenFor('a'), tableId: TABLE_ID });
    expect(h.last('a', 'table_forgotten')).toEqual({ type: 'table_forgotten', tableId: TABLE_ID });
    expect(await myTables('a', h.tokenFor('a'))).toEqual([]);
    expect(h.store.tables.has(TABLE_ID)).toBe(true);
    expect(h.store.seats.get(TABLE_ID)!.size).toBe(1);
  });

  it('drops memberships whose table no longer exists', async () => {
    await h.seat('a');
    h.store.tables.delete(TABLE_ID);
    expect(await myTables('a', h.tokenFor('a'))).toEqual([]);
    expect(await h.store.listMemberships('sub-a')).toEqual([]);
  });

  it('caps how many tables one member can host', async () => {
    await h.connect('m');
    for (let i = 0; i < MAX_OWNED_TABLES; i++) {
      await h.send('m', { action: 'create_table', accessToken: WORD_SMITH(), tableName: `T${i}` });
    }
    await h.send('m', { action: 'create_table', accessToken: WORD_SMITH(), tableName: 'one too many' });
    expect(h.lastError('m')).toEqual({ type: 'error', code: 'table_limit' });
    expect(h.store.tables.size).toBe(MAX_OWNED_TABLES + 1);
  });
});

describe('host deletes a table', () => {
  it('removes the table, its seats, and every member’s list entry, and tells everyone watching', async () => {
    await h.connect('host');
    await h.join('host', TABLE_ID, WORD_SMITH());
    const tokenA = await h.seat('a');
    const tokenB = await h.seat('b');
    await h.send('a', { action: 'start_game', seatToken: tokenA });
    await h.connect('lister');

    await h.send('lister', { action: 'delete_table', accessToken: WORD_SMITH(), tableId: TABLE_ID });

    const notice = { type: 'table_deleted', tableId: TABLE_ID };
    expect(h.last('lister', 'table_deleted')).toEqual(notice);
    for (const conn of ['host', 'a', 'b']) {
      expect(h.last(conn, 'table_deleted')).toEqual(notice);
    }
    expect(h.store.tables.has(TABLE_ID)).toBe(false);
    expect(h.store.seats.has(TABLE_ID)).toBe(false);
    for (const sub of ['sub-word-smith', 'sub-a', 'sub-b']) {
      expect(await h.store.listMemberships(sub)).toEqual([]);
    }

    await h.send('b', { action: 'pass', seatToken: tokenB });
    expect(h.lastError('b')).toEqual({ type: 'error', code: 'table_not_found' });
    await h.connect('late');
    await h.join('late');
    expect(h.lastError('late')).toEqual({ type: 'error', code: 'table_not_found' });
  });

  it('refuses anyone but the host, leaving the table as it was', async () => {
    await h.seat('a');
    await h.send('a', { action: 'delete_table', accessToken: h.tokenFor('a'), tableId: TABLE_ID });
    expect(h.lastError('a')).toEqual({ type: 'error', code: 'not_table_host' });
    expect(h.store.tables.has(TABLE_ID)).toBe(true);
    expect(h.store.seats.get(TABLE_ID)!.size).toBe(1);
    expect(await myTables('a', h.tokenFor('a'))).toHaveLength(1);
    expect(h.messages('a').some((m) => m.type === 'table_deleted')).toBe(false);
  });

  it('refuses a table with no recorded host, a signed-out caller, and a missing table', async () => {
    await h.seed({}, 'legacy');
    await h.connect('m');
    await h.send('m', { action: 'delete_table', accessToken: WORD_SMITH(), tableId: 'legacy' });
    expect(h.lastError('m')).toEqual({ type: 'error', code: 'not_table_host' });
    await h.send('m', { action: 'delete_table', tableId: TABLE_ID });
    expect(h.lastError('m')).toEqual({ type: 'error', code: 'sign_in_required' });
    await h.send('m', { action: 'delete_table', accessToken: WORD_SMITH(), tableId: 'nope' });
    expect(h.lastError('m')).toEqual({ type: 'error', code: 'table_not_found' });
    expect(h.store.tables.has('legacy')).toBe(true);
    expect(h.store.tables.has(TABLE_ID)).toBe(true);
  });

  it('frees a hosting slot', async () => {
    await h.connect('m');
    for (let i = 0; i < MAX_OWNED_TABLES; i++) {
      await h.send('m', { action: 'create_table', accessToken: WORD_SMITH(), tableName: `T${i}` });
    }
    const oldest = h.last('m', 'table_created').table.tableId;
    await h.send('m', { action: 'delete_table', accessToken: WORD_SMITH(), tableId: oldest });
    await h.send('m', { action: 'create_table', accessToken: WORD_SMITH(), tableName: 'room again' });
    expect(h.last('m', 'table_created').table.tableName).toBe('room again');
  });
});

describe('table names', () => {
  it('trims, collapses whitespace, strips control and bidi characters, and caps the length', () => {
    expect(sanitizeTableName('  a\tb \u202Ec\u0007 ')).toBe('a b c');
    expect(sanitizeTableName('x'.repeat(80))).toHaveLength(40);
    expect(sanitizeTableName('   ')).toBeNull();
    expect(sanitizeTableName(42)).toBeNull();
  });
});
