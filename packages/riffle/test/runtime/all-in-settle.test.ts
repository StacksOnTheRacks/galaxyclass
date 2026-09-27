import { describe, expect, it, vi } from 'vitest';
import { legalize } from '../../src/rules/legalize.js';
import { createRuntimeHandler } from '../../src/runtime/handler.js';
import type { MatchStore } from '../../src/runtime/store.js';
import type {
  ConnectionRecord,
  OutboundMessage,
  SeatRecord,
  TableRecord,
  WebSocketEvent,
} from '../../src/runtime/types.js';

function wsEvent(routeKey: string, connectionId: string, body?: string): WebSocketEvent {
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
  updateTableWithVersionCalls = 0;

  private seatKey(tableId: string, seatId: string): string {
    return `${tableId}:${seatId}`;
  }

  async putConnection(connectionId: string): Promise<void> {
    this.connections.set(connectionId, { connectionId });
  }

  async deleteConnection(connectionId: string): Promise<void> {
    this.connections.delete(connectionId);
  }

  async getConnection(connectionId: string): Promise<ConnectionRecord | null> {
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
    this.updateTableWithVersionCalls += 1;
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
}

function createHarness(rngSeed = 7) {
  const store = new MemoryStore();
  const sent = new Map<string, OutboundMessage[]>();
  const postToConnection = vi.fn(async (connectionId: string, message: OutboundMessage) => {
    const rows = sent.get(connectionId) ?? [];
    rows.push(message);
    sent.set(connectionId, rows);
  });

  const handler = createRuntimeHandler({
    store,
    postToConnection,
    now: () => '2026-09-25T12:00:00.000Z',
    rngSeed: () => rngSeed,
  });

  return { handler, store, sent, postToConnection };
}

async function setupTable(
  handler: ReturnType<typeof createHarness>['handler'],
  store: MatchStore,
) {
  await store.createTable('table-1', '2026-09-25T12:00:00.000Z');
  await handler(wsEvent('$connect', 'conn-a'), {});
  await store.bindConnectionToTable('conn-a', 'table-1');
  await handler(wsEvent('$connect', 'conn-b'), {});
  await handler(
    wsEvent('$default', 'conn-b', JSON.stringify({ action: 'join_table', tableId: 'table-1' })),
    {},
  );
}

function lastSnapshot(messages: OutboundMessage[] | undefined) {
  return messages?.filter((message) => message.type === 'table_snapshot').at(-1);
}

async function sitTwoPlayers(handler: ReturnType<typeof createHarness>['handler'], sent: Map<string, OutboundMessage[]>) {
  await handler(
    wsEvent('$default', 'conn-a', JSON.stringify({ action: 'sit', seatId: '1', displayName: 'Alice' })),
    {},
  );
  const tokenA = (sent.get('conn-a')?.find((m) => m.type === 'sat') as { seatToken: string }).seatToken;
  await handler(
    wsEvent('$default', 'conn-b', JSON.stringify({ action: 'sit', seatId: '4', displayName: 'Bob' })),
    {},
  );
  const tokenB = (sent.get('conn-b')?.find((m) => m.type === 'sat') as { seatToken: string }).seatToken;
  return { tokenA, tokenB };
}

async function startHeadsUpHand(
  handler: ReturnType<typeof createHarness>['handler'],
  sent: Map<string, OutboundMessage[]>,
  tokenA: string,
) {
  sent.forEach((messages) => {
    messages.length = 0;
  });
  await handler(
    wsEvent('$default', 'conn-a', JSON.stringify({ action: 'start_hand', seatToken: tokenA })),
    {},
  );
}

describe('all-in settle on serverless runtime', () => {
  it('heads-up all-in runout settles in one act with chip conservation', async () => {
    const { handler, store, sent } = createHarness(7);
    await setupTable(handler, store);
    const { tokenA, tokenB } = await sitTwoPlayers(handler, sent);
    await startHeadsUpHand(handler, sent, tokenA);

    const callsBefore = store.updateTableWithVersionCalls;
    sent.forEach((messages) => {
      messages.length = 0;
    });

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'raise', seatToken: tokenA, amount: 2000 })),
      {},
    );
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'call', seatToken: tokenB })),
      {},
    );

    const table = await store.getTable('table-1');
    const seats = await store.listSeats('table-1');
    expect(table?.phase).toBe('complete');
    expect(table?.completeReason).toBe('showdown');
    expect(table?.board).toHaveLength(5);
    expect(table?.pot).toBe(0);
    expect(table?.burns?.length ?? 0).toBeGreaterThan(0);
    expect(seats.reduce((sum, seat) => sum + seat.stack, 0)).toBe(4000);

    const snapA = lastSnapshot(sent.get('conn-a'));
    const snapB = lastSnapshot(sent.get('conn-b'));
    expect(JSON.stringify(snapA)).not.toContain('deckRemaining');
    expect(JSON.stringify(snapA)).not.toContain('burns');
    expect(snapA?.seats.some((seat) => seat.holeCards?.length === 2)).toBe(true);
    expect(snapB?.seats.some((seat) => seat.holeCards?.length === 2)).toBe(true);
    expect(store.updateTableWithVersionCalls - callsBefore).toBe(2);
  });

  it('rejects client_supplied_state without version change or extra fan-out', async () => {
    const { handler, store, sent, postToConnection } = createHarness(7);
    await setupTable(handler, store);
    const { tokenA } = await sitTwoPlayers(handler, sent);
    await startHeadsUpHand(handler, sent, tokenA);

    const versionBefore = (await store.getTable('table-1'))!.version;
    postToConnection.mockClear();

    await handler(
      wsEvent(
        '$default',
        'conn-a',
        JSON.stringify({ action: 'call', seatToken: tokenA, winners: [{ seatId: '1', amount: 9999 }] }),
      ),
      {},
    );

    expect(sent.get('conn-a')?.at(-1)).toEqual({ type: 'error', code: 'client_supplied_state' });
    expect((await store.getTable('table-1'))!.version).toBe(versionBefore);
    expect(postToConnection).toHaveBeenCalledTimes(1);
  });

  it('historical rules path still rejects all-in without allowAllIn', () => {
    const state = {
      seats: [
        {
          seatId: '1',
          stack: 150,
          hole: ['As', 'Ah'] as const,
          folded: false,
          streetCommitted: 0,
          handCommitted: 0,
        },
      ],
      buttonSeatId: '1',
      blinds: { smallBlind: 1, bigBlind: 2 },
      street: 'preflop' as const,
      phase: 'betting' as const,
      currentSeatId: '1',
      board: [],
      pot: 0,
      currentBet: 150,
      lastRaiseSize: 2,
      deckRemaining: [],
      burns: [],
      winners: null,
      completeReason: null,
    };

    const rejected = legalize(state, '1', { type: 'call' });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.error.code).toBe('all_in_or_side_pot_unsupported');
    }
  });
});
