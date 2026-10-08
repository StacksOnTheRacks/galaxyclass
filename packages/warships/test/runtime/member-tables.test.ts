import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableSummary } from '../../src/protocol.js';
import { createDynamoStore } from '../../src/runtime/dynamo-store.js';
import { createRuntimeHandler } from '../../src/runtime/handler.js';
import { MemoryWarshipsStore } from '../../src/runtime/memory-store.js';
import { MAX_OWNED_TABLES, sanitizeTableName } from '../../src/runtime/tables.js';
import { attackerKey, signAccessToken } from '../support/cognito-tokens.js';
import { A_FLEET, B_FLEET } from '../support/fleets.js';
import { Harness, TABLE_ID } from '../support/runtime-harness.js';

let h: Harness;
beforeEach(async () => {
  h = new Harness();
  await h.seed();
});
afterEach(() => vi.restoreAllMocks());

const ADMIRAL = () => signAccessToken();

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

    await h.send('anon', { action: 'fire', seatToken: 'x', target: { row: 0, col: 0 } });
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
    const sent: unknown[] = [];
    const handler = createRuntimeHandler({
      store: new MemoryWarshipsStore(),
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
    await handler(event({ action: 'join_table', tableId: TABLE_ID, accessToken: ADMIRAL() }));
    expect(sent.at(-1)).toEqual({ type: 'error', code: 'identity_unavailable' });
  });
});

describe('member table manager', () => {
  it('creates a two-seat table owned by the member and lists it first', async () => {
    await h.connect('m');
    await h.send('m', { action: 'create_table', accessToken: ADMIRAL(), tableName: '  Friday\n fleet   night  ' });
    const created = h.last('m', 'table_created').table;
    expect(created).toMatchObject({
      tableName: 'Friday fleet night',
      role: 'owner',
      status: 'waiting',
      maxSeats: 2,
      seats: [],
      gameNumber: 0,
    });
    expect(h.store.tables.get(created.tableId)).toMatchObject({ createdBy: 'sub-admiral', maxSeats: 2 });

    const tables = await myTables('m', ADMIRAL());
    expect(tables.map((t) => t.tableId)).toEqual([created.tableId]);
    expect(h.last('m', 'my_tables').you).toEqual({ gamerTag: 'Admiral', avatarId: 12 });
  });

  it('names an unnamed table after its host, or plainly without a gamer tag', async () => {
    await h.connect('m');
    await h.send('m', { action: 'create_table', accessToken: ADMIRAL() });
    expect(h.last('m', 'table_created').table.tableName).toBe("Admiral's table");
    await h.send('m', { action: 'create_table', accessToken: h.tokenFor('m') });
    expect(h.last('m', 'table_created').table.tableName).toBe('Warships table');
  });

  it('adds a table to a member’s list when they open its link, keeping the host as owner', async () => {
    await h.seat('friend');
    const friend = await myTables('friend', h.tokenFor('friend'));
    expect(friend).toHaveLength(1);
    expect(friend[0]).toMatchObject({ tableId: TABLE_ID, role: 'member', tableName: 'Pacific', maxSeats: 2 });
    expect(friend[0]!.seats).toEqual([
      { seatId: '1', displayName: expect.any(String), avatarId: expect.any(Number), away: false, isYou: true },
    ]);

    await h.connect('host');
    await h.join('host', TABLE_ID, ADMIRAL());
    const host = await myTables('host', ADMIRAL());
    expect(host[0]).toMatchObject({ tableId: TABLE_ID, role: 'owner' });
    expect(host[0]!.seats[0]!.isYou).toBe(false);
  });

  it('shows each table’s status and never leaks subs, seat tokens, or fleets', async () => {
    const tokens = await h.battle({ a: A_FLEET, b: B_FLEET });
    const tables = await myTables('b', h.tokenFor('b'));
    expect(tables[0]).toMatchObject({ status: 'battle', gameNumber: 1 });
    const frame = (h.wire.get('b') ?? []).at(-1)!;
    expect(frame).not.toMatch(/sub-|seatToken|playerSub|connectionId|fleet|shipId/);
    expect(frame).not.toContain(tokens.a);
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
      await h.send('m', { action: 'create_table', accessToken: ADMIRAL(), tableName: `T${i}` });
    }
    await h.send('m', { action: 'create_table', accessToken: ADMIRAL(), tableName: 'one too many' });
    expect(h.lastError('m')).toEqual({ type: 'error', code: 'table_limit' });
    expect(h.store.tables.size).toBe(MAX_OWNED_TABLES + 1);
  });
});

describe('host deletes a table', () => {
  it('removes the table, its seats, and every member’s list entry, and tells everyone watching', async () => {
    await h.connect('host');
    await h.join('host', TABLE_ID, ADMIRAL());
    const tokens = await h.battle({ a: A_FLEET, b: B_FLEET });
    await h.connect('lister');

    await h.send('lister', { action: 'delete_table', accessToken: ADMIRAL(), tableId: TABLE_ID });

    const notice = { type: 'table_deleted', tableId: TABLE_ID };
    expect(h.last('lister', 'table_deleted')).toEqual(notice);
    for (const conn of ['host', 'a', 'b']) {
      expect(h.last(conn, 'table_deleted')).toEqual(notice);
    }
    expect(h.store.tables.has(TABLE_ID)).toBe(false);
    expect(h.store.seats.has(TABLE_ID)).toBe(false);
    for (const sub of ['sub-admiral', 'sub-a', 'sub-b']) {
      expect(await h.store.listMemberships(sub)).toEqual([]);
    }

    await h.send('b', { action: 'forfeit', seatToken: tokens.b });
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
    await h.seed({ createdBy: null }, 'legacy');
    await h.connect('m');
    await h.send('m', { action: 'delete_table', accessToken: ADMIRAL(), tableId: 'legacy' });
    expect(h.lastError('m')).toEqual({ type: 'error', code: 'not_table_host' });
    await h.send('m', { action: 'delete_table', tableId: TABLE_ID });
    expect(h.lastError('m')).toEqual({ type: 'error', code: 'sign_in_required' });
    await h.send('m', { action: 'delete_table', accessToken: ADMIRAL(), tableId: 'nope' });
    expect(h.lastError('m')).toEqual({ type: 'error', code: 'table_not_found' });
    expect(h.store.tables.has('legacy')).toBe(true);
    expect(h.store.tables.has(TABLE_ID)).toBe(true);
  });

  it('frees a hosting slot', async () => {
    await h.connect('m');
    for (let i = 0; i < MAX_OWNED_TABLES; i++) {
      await h.send('m', { action: 'create_table', accessToken: ADMIRAL(), tableName: `T${i}` });
    }
    const oldest = h.last('m', 'table_created').table.tableId;
    await h.send('m', { action: 'delete_table', accessToken: ADMIRAL(), tableId: oldest });
    await h.send('m', { action: 'create_table', accessToken: ADMIRAL(), tableName: 'room again' });
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

describe('key isolation in the shared table', () => {
  it('puts every partition and index key a member flow touches under WS#', async () => {
    const commands: Array<{ input: Record<string, unknown> }> = [];
    const items = new Map<string, Record<string, unknown>>();
    const send = vi.fn(async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      commands.push(command);
      const name = command.constructor.name;
      if (name === 'GetCommand') {
        const key = command.input.Key as { PK: string; SK: string };
        return { Item: items.get(`${key.PK}|${key.SK}`) };
      }
      if (name === 'PutCommand') {
        const item = command.input.Item as { PK: string; SK: string };
        items.set(`${item.PK}|${item.SK}`, item);
      }
      if (name === 'TransactWriteCommand') {
        for (const entry of command.input.TransactItems as Array<{ Put?: { Item: { PK: string; SK: string } } }>) {
          if (entry.Put) items.set(`${entry.Put.Item.PK}|${entry.Put.Item.SK}`, entry.Put.Item);
        }
      }
      return { Items: [] };
    });
    const handler = createRuntimeHandler({
      store: createDynamoStore({ send }, 'ScribbleTable'),
      resolvePlayer: async () => ({ sub: 'sub-admiral', gamerTag: 'Admiral', avatarId: 12 }),
      postToConnection: async () => {},
      newTableId: () => 't1',
    });
    const event = (routeKey: string, body?: unknown) => ({
      requestContext: { routeKey, connectionId: 'c1', domainName: 'x', stage: 'prod' },
      body: body === undefined ? null : JSON.stringify(body),
    });
    await handler(event('$connect'));
    await handler(event('$default', { action: 'create_table', accessToken: 'x' }));
    await handler(event('$default', { action: 'list_my_tables', accessToken: 'x' }));
    await handler(event('$default', { action: 'join_table', accessToken: 'x', tableId: 't1' }));
    await handler(event('$default', { action: 'sit', accessToken: 'x' }));
    await handler(event('$default', { action: 'delete_table', accessToken: 'x', tableId: 't1' }));
    await handler(event('$disconnect'));

    const keys: string[] = [];
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(collect);
      if (typeof value !== 'object' || value === null) return;
      for (const [k, v] of Object.entries(value)) {
        if ((k === 'PK' || k === 'GSI1PK' || k === ':pk' || k === ':gsiPk') && typeof v === 'string') keys.push(v);
        collect(v);
      }
    };
    commands.forEach((command) => collect(command.input));
    expect(keys.length).toBeGreaterThan(10);
    expect(keys.filter((key) => !key.startsWith('WS#'))).toEqual([]);
  });
});
