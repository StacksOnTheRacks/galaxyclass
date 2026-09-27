import { describe, expect, it, vi } from 'vitest';
import { createRuntimeHandler } from '../../src/runtime/handler.js';
import type { MatchStore } from '../../src/runtime/store.js';
import type {
  ConnectionRecord,
  OutboundMessage,
  SeatRecord,
  TableRecord,
  WebSocketEvent,
} from '../../src/runtime/types.js';

function wsEvent(
  routeKey: string,
  connectionId: string,
  body?: string,
): WebSocketEvent {
  return {
    requestContext: {
      routeKey,
      connectionId,
      domainName: 'example.execute-api.us-east-1.amazonaws.com',
      stage: 'prod',
    },
    body,
  };
}

class MemoryStore implements MatchStore {
  private connections = new Map<string, ConnectionRecord>();
  private tables = new Map<string, TableRecord>();
  private seats = new Map<string, SeatRecord>();

  private seatKey(tableId: string, seatId: string): string {
    return `${tableId}:${seatId}`;
  }

  async putConnection(connectionId: string): Promise<void> {
    this.connections.set(connectionId, { connectionId });
  }

  async deleteConnection(connectionId: string): Promise<void> {
    this.connections.delete(connectionId);
  }

  async getConnection(connectionId: string) {
    return this.connections.get(connectionId) ?? null;
  }

  async createTable(tableId: string, createdAt: string): Promise<TableRecord> {
    const table: TableRecord = {
      tableId,
      version: 1,
      status: 'open',
      createdAt,
      defaultStack: 2000,
      maxSeats: 8,
      blinds: { smallBlind: 1, bigBlind: 2 },
      handNumber: 0,
      pot: 0,
      board: [],
      street: null,
      currentSeatId: null,
    };
    this.tables.set(tableId, table);
    return table;
  }

  async bindConnectionToTable(connectionId: string, tableId: string): Promise<void> {
    const row = this.connections.get(connectionId);
    if (!row) {
      throw new Error('missing connection');
    }
    row.tableId = tableId;
  }

  async bindConnectionToSeat(connectionId: string, seatId: string): Promise<void> {
    const row = this.connections.get(connectionId);
    if (!row) {
      throw new Error('missing connection');
    }
    row.seatId = seatId;
  }

  async clearConnectionSeat(connectionId: string): Promise<void> {
    const row = this.connections.get(connectionId);
    if (row) {
      delete row.seatId;
    }
  }

  async getTable(tableId: string): Promise<TableRecord | null> {
    return this.tables.get(tableId) ?? null;
  }

  async incrementTableVersion(
    tableId: string,
    expectedVersion: number,
  ): Promise<TableRecord | null> {
    const table = this.tables.get(tableId);
    if (!table || table.version !== expectedVersion) {
      return null;
    }
    const updated = { ...table, version: table.version + 1 };
    this.tables.set(tableId, updated);
    return updated;
  }

  async listConnectionsForTable(tableId: string): Promise<string[]> {
    return [...this.connections.values()]
      .filter((row) => row.tableId === tableId)
      .map((row) => row.connectionId);
  }

  async getSeat(tableId: string, seatId: string): Promise<SeatRecord | null> {
    return this.seats.get(this.seatKey(tableId, seatId)) ?? null;
  }

  async listSeats(tableId: string): Promise<SeatRecord[]> {
    return [...this.seats.entries()]
      .filter(([key]) => key.startsWith(`${tableId}:`))
      .map(([, seat]) => seat)
      .sort((a, b) => Number(a.seatId) - Number(b.seatId));
  }

  async putSeat(tableId: string, seat: SeatRecord): Promise<void> {
    this.seats.set(this.seatKey(tableId, seat.seatId), { ...seat });
  }

  async deleteSeat(tableId: string, seatId: string): Promise<void> {
    this.seats.delete(this.seatKey(tableId, seatId));
  }

  async updateTableWithVersion(
    tableId: string,
    expectedVersion: number,
    table: TableRecord,
    seats: SeatRecord[],
  ): Promise<TableRecord | null> {
    const current = this.tables.get(tableId);
    if (!current || current.version !== expectedVersion) {
      return null;
    }
    this.tables.set(tableId, { ...table });
    for (const seat of seats) {
      await this.putSeat(tableId, seat);
    }
    return table;
  }

  hasConnection(connectionId: string): boolean {
    return this.connections.has(connectionId);
  }
}

function createHarness(options?: {
  incrementTableVersion?: MatchStore['incrementTableVersion'];
}) {
  const store = new MemoryStore();
  const sent = new Map<string, OutboundMessage[]>();

  const handler = createRuntimeHandler({
    store: options?.incrementTableVersion
      ? {
          ...store,
          incrementTableVersion: options.incrementTableVersion,
        }
      : store,
    postToConnection: async (connectionId, message) => {
      const rows = sent.get(connectionId) ?? [];
      rows.push(message);
      sent.set(connectionId, rows);
    },
    now: () => '2026-09-25T12:00:00.000Z',
  });

  return { handler, store, sent };
}

async function seedTable(store: MatchStore, tableId = 'table-uuid-1234'): Promise<TableRecord> {
  return store.createTable(tableId, '2026-09-25T12:00:00.000Z');
}

describe('match runtime handler', () => {
  it('persists a connection row on $connect', async () => {
    const { handler, store } = createHarness();
    await handler(wsEvent('$connect', 'conn-a'), {});
    expect(store.hasConnection('conn-a')).toBe(true);
  });

  it('treats ping as a silent keepalive', async () => {
    const { handler, sent } = createHarness();
    await handler(wsEvent('$connect', 'conn-a'), {});
    const result = await handler(wsEvent('$default', 'conn-a', JSON.stringify({ action: 'ping' })), {});
    expect(result).toEqual({ statusCode: 200 });
    expect(sent.get('conn-a')).toBeUndefined();
  });

  it('rejects resume_seat with an unknown token', async () => {
    const { handler, store, sent } = createHarness();
    const table = await seedTable(store);
    await handler(wsEvent('$connect', 'conn-a'), {});
    await handler(wsEvent('$default', 'conn-a', JSON.stringify({ action: 'join_table', tableId: table.tableId })), {});
    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'resume_seat', seatToken: 'forged' })),
      {},
    );
    expect(sent.get('conn-a')?.at(-1)).toEqual({ type: 'error', code: 'invalid_seat_token' });
    expect((await store.getConnection('conn-a'))?.seatId).toBeUndefined();
  });

  it('rejects public create_table without minting or binding a table', async () => {
    const { handler, store, sent } = createHarness();
    const createTable = vi.spyOn(store, 'createTable');
    const bindConnectionToTable = vi.spyOn(store, 'bindConnectionToTable');

    await handler(wsEvent('$connect', 'conn-a'), {});
    const result = await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'create_table' })),
      {},
    );

    expect(result).toEqual({ statusCode: 200 });
    expect(sent.get('conn-a')).toEqual([{ type: 'error', code: 'unsupported_action' }]);
    expect(createTable).not.toHaveBeenCalled();
    expect(bindConnectionToTable).not.toHaveBeenCalled();
    expect((await store.getConnection('conn-a'))?.tableId).toBeUndefined();
    expect(sent.get('conn-a')?.some((message) => message.type === 'table_created')).toBe(false);
  });

  it('joins a seeded table by its unguessable id', async () => {
    const { handler, store } = createHarness();
    await seedTable(store, 'f47ac10b-58cc-4372-a567-0e02b2c3d479');

    await handler(wsEvent('$connect', 'conn-b'), {});

    await expect(
      handler(
        wsEvent('$default', 'conn-b', JSON.stringify({
          action: 'join_table',
          tableId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        })),
        {},
      ),
    ).resolves.toEqual({ statusCode: 200 });
    expect((await store.getConnection('conn-b'))?.tableId).toBe(
      'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    );
  });

  it('join_table binds, bumps version, and fans out a public snapshot', async () => {
    const { handler, store, sent } = createHarness();
    await seedTable(store);

    await handler(wsEvent('$connect', 'conn-a'), {});
    await store.bindConnectionToTable('conn-a', 'table-uuid-1234');

    await handler(wsEvent('$connect', 'conn-b'), {});
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({
        action: 'join_table',
        tableId: 'table-uuid-1234',
      })),
      {},
    );

    const table = await store.getTable('table-uuid-1234');
    expect(table?.version).toBe(2);

    const snapshot = sent.get('conn-b')?.[0];
    expect(snapshot).toMatchObject({
      type: 'table_snapshot',
      tableId: 'table-uuid-1234',
      version: 2,
      status: 'open',
      blindsLabel: '$1 / $2',
      seatedPlayersLabel: '0 / 8',
    });
    expect(snapshot).not.toHaveProperty('hole');
    expect(snapshot).not.toHaveProperty('seatToken');

    expect(sent.get('conn-a')).toEqual([snapshot]);
    expect(sent.get('conn-b')).toEqual([snapshot]);
  });

  it('does not fan out when the conditional version write fails', async () => {
    const store = new MemoryStore();
    const sent = new Map<string, OutboundMessage[]>();
    const increment = vi.fn(async () => null);

    const handler = createRuntimeHandler({
      store: {
        putConnection: store.putConnection.bind(store),
        deleteConnection: store.deleteConnection.bind(store),
        getConnection: store.getConnection.bind(store),
        createTable: store.createTable.bind(store),
        bindConnectionToTable: store.bindConnectionToTable.bind(store),
        bindConnectionToSeat: store.bindConnectionToSeat.bind(store),
        clearConnectionSeat: store.clearConnectionSeat.bind(store),
        getTable: store.getTable.bind(store),
        incrementTableVersion: increment,
        listConnectionsForTable: store.listConnectionsForTable.bind(store),
        getSeat: store.getSeat.bind(store),
        listSeats: store.listSeats.bind(store),
        putSeat: store.putSeat.bind(store),
        deleteSeat: store.deleteSeat.bind(store),
        updateTableWithVersion: store.updateTableWithVersion.bind(store),
      },
      postToConnection: async (connectionId, message) => {
        const rows = sent.get(connectionId) ?? [];
        rows.push(message);
        sent.set(connectionId, rows);
      },
      now: () => '2026-09-25T12:00:00.000Z',
    });

    await seedTable(store);
    await handler(wsEvent('$connect', 'conn-a'), {});
    await store.bindConnectionToTable('conn-a', 'table-uuid-1234');
    await handler(wsEvent('$connect', 'conn-b'), {});
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({
        action: 'join_table',
        tableId: 'table-uuid-1234',
      })),
      {},
    );

    expect(increment).toHaveBeenCalledOnce();
    expect(sent.get('conn-a')).toBeUndefined();
    expect(sent.get('conn-b')).toEqual([{ type: 'error', code: 'version_conflict' }]);
  });

  it('removes only the disconnected connection row', async () => {
    const { handler, store } = createHarness();
    await seedTable(store);

    await handler(wsEvent('$connect', 'conn-a'), {});
    await store.bindConnectionToTable('conn-a', 'table-uuid-1234');
    await handler(wsEvent('$connect', 'conn-b'), {});
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({
        action: 'join_table',
        tableId: 'table-uuid-1234',
      })),
      {},
    );

    await handler(wsEvent('$disconnect', 'conn-b'), {});

    expect(store.hasConnection('conn-b')).toBe(false);
    expect(store.hasConnection('conn-a')).toBe(true);
    expect(await store.getTable('table-uuid-1234')).not.toBeNull();
  });

  it('rejects unsupported gameplay actions without writing table state', async () => {
    const { handler, store, sent } = createHarness();
    await seedTable(store);

    await handler(wsEvent('$connect', 'conn-a'), {});
    await store.bindConnectionToTable('conn-a', 'table-uuid-1234');

    const before = await store.getTable('table-uuid-1234');

    for (const action of ['fold', 'check', 'call', 'bet', 'raise', 'deal', 'unknown']) {
      await handler(
        wsEvent('$default', 'conn-a', JSON.stringify({ action })),
        {},
      );
    }

    expect(await store.getTable('table-uuid-1234')).toEqual(before);
    expect(sent.get('conn-a')).toEqual([
      { type: 'error', code: 'hand_not_in_progress' },
      { type: 'error', code: 'hand_not_in_progress' },
      { type: 'error', code: 'hand_not_in_progress' },
      { type: 'error', code: 'hand_not_in_progress' },
      { type: 'error', code: 'hand_not_in_progress' },
      { type: 'error', code: 'unsupported_action' },
      { type: 'error', code: 'unsupported_action' },
    ]);
  });
});
