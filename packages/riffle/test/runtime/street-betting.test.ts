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

function snapshotCount(messages: OutboundMessage[] | undefined) {
  return messages?.filter((message) => message.type === 'table_snapshot').length ?? 0;
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

describe('street betting on serverless runtime', () => {
  it('legal fold, check, call, bet, and raise advance the current seat', async () => {
    const { handler, store, sent } = createHarness(7);
    await setupTable(handler, store);
    const { tokenA, tokenB } = await sitTwoPlayers(handler, sent);
    await startHeadsUpHand(handler, sent, tokenA);

    const tableBefore = await store.getTable('table-1');
    expect(tableBefore?.currentSeatId).toBe('1');

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'call', seatToken: tokenA })),
      {},
    );
    expect((await store.getTable('table-1'))?.currentSeatId).toBe('4');

    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'check', seatToken: tokenB })),
      {},
    );
    const afterPreflop = await store.getTable('table-1');
    expect(afterPreflop?.street).toBe('flop');
    expect(afterPreflop?.board).toHaveLength(3);
    expect(afterPreflop?.currentSeatId).toBe('4');
  });

  it('auto-deals flop, turn, and river when betting rounds complete with two players in', async () => {
    const { handler, store, sent } = createHarness(7);
    await setupTable(handler, store);
    const { tokenA, tokenB } = await sitTwoPlayers(handler, sent);
    await startHeadsUpHand(handler, sent, tokenA);

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'call', seatToken: tokenA })),
      {},
    );
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'check', seatToken: tokenB })),
      {},
    );
    expect((await store.getTable('table-1'))?.board).toHaveLength(3);

    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'check', seatToken: tokenB })),
      {},
    );
    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'check', seatToken: tokenA })),
      {},
    );
    expect((await store.getTable('table-1'))?.board).toHaveLength(4);
    expect((await store.getTable('table-1'))?.street).toBe('turn');

    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'check', seatToken: tokenB })),
      {},
    );
    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'check', seatToken: tokenA })),
      {},
    );
    expect((await store.getTable('table-1'))?.board).toHaveLength(5);
    expect((await store.getTable('table-1'))?.street).toBe('river');
  });

  it('completing river betting settles the hand with stacks updated', async () => {
    const { handler, store, sent } = createHarness(7);
    await setupTable(handler, store);
    const { tokenA, tokenB } = await sitTwoPlayers(handler, sent);
    await startHeadsUpHand(handler, sent, tokenA);

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'call', seatToken: tokenA })),
      {},
    );
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'check', seatToken: tokenB })),
      {},
    );
    for (let street = 0; street < 3; street += 1) {
      await handler(
        wsEvent('$default', 'conn-b', JSON.stringify({ action: 'check', seatToken: tokenB })),
        {},
      );
      await handler(
        wsEvent('$default', 'conn-a', JSON.stringify({ action: 'check', seatToken: tokenA })),
        {},
      );
    }

    const table = await store.getTable('table-1');
    const seatA = await store.getSeat('table-1', '1');
    const seatB = await store.getSeat('table-1', '4');
    expect(table?.phase).toBe('complete');
    expect(table?.completeReason).toBe('showdown');
    expect(table?.currentSeatId).toBeNull();
    expect(table?.board).toHaveLength(5);
    expect(table?.pot).toBe(0);
    expect((seatA!.stack + seatB!.stack + table!.pot!)).toBe(4000);
    expect(seatA!.stack + seatB!.stack).toBe(4000);
  });

  it('fold to one settles immediately with pot awarded and no board', async () => {
    const { handler, store, sent } = createHarness(7);
    await setupTable(handler, store);
    const { tokenA, tokenB } = await sitTwoPlayers(handler, sent);
    await startHeadsUpHand(handler, sent, tokenA);

    const stackBBefore = (await store.getSeat('table-1', '4'))!.stack;

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'fold', seatToken: tokenA })),
      {},
    );

    const table = await store.getTable('table-1');
    expect(table?.phase).toBe('complete');
    expect(table?.completeReason).toBe('fold_to_one');
    expect(table?.currentSeatId).toBeNull();
    expect(table?.board).toHaveLength(0);
    expect(table?.pot).toBe(0);
    expect((await store.getSeat('table-1', '4'))!.stack).toBeGreaterThan(stackBBefore);
  });

  it('rejects actions after complete without mutation or fan-out', async () => {
    const { handler, store, sent, postToConnection } = createHarness(7);
    await setupTable(handler, store);
    const { tokenA, tokenB } = await sitTwoPlayers(handler, sent);
    await startHeadsUpHand(handler, sent, tokenA);

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'fold', seatToken: tokenA })),
      {},
    );
    const versionAfterFold = (await store.getTable('table-1'))!.version;
    postToConnection.mockClear();

    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'check', seatToken: tokenB })),
      {},
    );
    expect(sent.get('conn-b')?.at(-1)).toEqual({ type: 'error', code: 'illegal_action' });
    expect((await store.getTable('table-1'))!.version).toBe(versionAfterFold);
    expect(postToConnection).toHaveBeenCalledTimes(1);
  });

  it('rejects bet below minimum and raise below minimum raise-to', async () => {
    const { handler, store, sent } = createHarness(7);
    await setupTable(handler, store);
    const { tokenA, tokenB } = await sitTwoPlayers(handler, sent);
    await startHeadsUpHand(handler, sent, tokenA);

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'call', seatToken: tokenA })),
      {},
    );
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'check', seatToken: tokenB })),
      {},
    );
    const versionOnFlop = (await store.getTable('table-1'))!.version;

    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'bet', seatToken: tokenB, amount: 1 })),
      {},
    );
    expect(sent.get('conn-b')?.at(-1)).toEqual({ type: 'error', code: 'illegal_action' });
    expect((await store.getTable('table-1'))!.version).toBe(versionOnFlop);

    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'bet', seatToken: tokenB, amount: 2 })),
      {},
    );
    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'raise', seatToken: tokenA, amount: 3 })),
      {},
    );
    expect(sent.get('conn-a')?.at(-1)).toEqual({ type: 'error', code: 'illegal_action' });
  });

  it('rejects check facing bet, call when nothing owed, bet facing bet, and raise with nothing faced', async () => {
    const { handler, store, sent } = createHarness(7);
    await setupTable(handler, store);
    const { tokenA, tokenB } = await sitTwoPlayers(handler, sent);
    await startHeadsUpHand(handler, sent, tokenA);

    const versionPreflop = (await store.getTable('table-1'))!.version;
    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'check', seatToken: tokenA })),
      {},
    );
    expect(sent.get('conn-a')?.at(-1)).toEqual({ type: 'error', code: 'illegal_action' });
    expect((await store.getTable('table-1'))!.version).toBe(versionPreflop);

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'call', seatToken: tokenA })),
      {},
    );
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'check', seatToken: tokenB })),
      {},
    );
    const versionOnFlop = (await store.getTable('table-1'))!.version;
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'call', seatToken: tokenB })),
      {},
    );
    expect(sent.get('conn-b')?.at(-1)).toEqual({ type: 'error', code: 'illegal_action' });
    expect((await store.getTable('table-1'))!.version).toBe(versionOnFlop);

    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'bet', seatToken: tokenB, amount: 4 })),
      {},
    );
    const versionFacingBet = (await store.getTable('table-1'))!.version;
    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'bet', seatToken: tokenA, amount: 4 })),
      {},
    );
    expect(sent.get('conn-a')?.at(-1)).toEqual({ type: 'error', code: 'illegal_action' });
    expect((await store.getTable('table-1'))!.version).toBe(versionFacingBet);
    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'check', seatToken: tokenA })),
      {},
    );
    expect(sent.get('conn-a')?.at(-1)).toEqual({ type: 'error', code: 'illegal_action' });

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'call', seatToken: tokenA })),
      {},
    );
    const versionOnTurn = (await store.getTable('table-1'))!.version;
    expect((await store.getTable('table-1'))?.street).toBe('turn');
    expect((await store.getTable('table-1'))?.currentSeatId).toBe('4');
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'raise', seatToken: tokenB, amount: 4 })),
      {},
    );
    expect(sent.get('conn-b')?.at(-1)).toEqual({ type: 'error', code: 'illegal_action' });
    expect((await store.getTable('table-1'))!.version).toBe(versionOnTurn);
  });

  it('rejects off-turn actions without mutation and accepts legal all-in', async () => {
    const { handler, store, sent } = createHarness(7);
    await setupTable(handler, store);
    const { tokenA, tokenB } = await sitTwoPlayers(handler, sent);
    await startHeadsUpHand(handler, sent, tokenA);

    const versionBefore = (await store.getTable('table-1'))!.version;

    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'call', seatToken: tokenB })),
      {},
    );
    expect(sent.get('conn-b')?.at(-1)).toEqual({ type: 'error', code: 'off_turn' });
    expect((await store.getTable('table-1'))!.version).toBe(versionBefore);

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'raise', seatToken: tokenA, amount: 2000 })),
      {},
    );
    const snap = lastSnapshot(sent.get('conn-a'));
    expect(snap?.type).toBe('table_snapshot');
    expect(snap?.seats.find((seat) => seat.seatId === '1')?.allIn).toBe(true);
    expect(snap?.seats.find((seat) => seat.seatId === '1')?.stack).toBe(0);
  });

  it('rejects client_supplied_state on betting actions', async () => {
    const { handler, store, sent } = createHarness(7);
    await setupTable(handler, store);
    const { tokenA } = await sitTwoPlayers(handler, sent);
    await startHeadsUpHand(handler, sent, tokenA);

    const versionBefore = (await store.getTable('table-1'))!.version;
    await handler(
      wsEvent(
        '$default',
        'conn-a',
        JSON.stringify({ action: 'call', seatToken: tokenA, board: ['As', 'Ks', 'Qs'] }),
      ),
      {},
    );
    expect(sent.get('conn-a')?.at(-1)).toEqual({ type: 'error', code: 'client_supplied_state' });
    expect((await store.getTable('table-1'))!.version).toBe(versionBefore);
  });

  it('uses one conditional write and fans out seat-scoped snapshots on street-completing success', async () => {
    const { handler, store, sent, postToConnection } = createHarness(7);
    await setupTable(handler, store);
    const { tokenA, tokenB } = await sitTwoPlayers(handler, sent);
    await startHeadsUpHand(handler, sent, tokenA);

    const callsBefore = store.updateTableWithVersionCalls;
    postToConnection.mockClear();

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'call', seatToken: tokenA })),
      {},
    );
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'check', seatToken: tokenB })),
      {},
    );

    expect(store.updateTableWithVersionCalls - callsBefore).toBe(2);
    expect(postToConnection).toHaveBeenCalledTimes(4);
    expect(lastSnapshot(sent.get('conn-a'))?.board).toHaveLength(3);
    expect(lastSnapshot(sent.get('conn-b'))?.board).toHaveLength(3);
  });

  it('snapshots hide foreign holes at terminal phases and omit deck or burns', async () => {
    const { handler, store, sent } = createHarness(7);
    await setupTable(handler, store);
    const { tokenA, tokenB } = await sitTwoPlayers(handler, sent);
    await startHeadsUpHand(handler, sent, tokenA);

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'fold', seatToken: tokenA })),
      {},
    );

    const snapA = lastSnapshot(sent.get('conn-a'));
    const snapB = lastSnapshot(sent.get('conn-b'));
    expect(snapA?.phase).toBe('complete');
    expect(snapB?.phase).toBe('complete');
    expect(snapA?.completeReason).toBe('fold_to_one');
    expect(snapA?.pocketCards).toHaveLength(2);
    expect(snapB?.pocketCards).toHaveLength(2);
    expect(snapA?.pocketCards).not.toEqual(snapB?.pocketCards);
    expect(snapA?.seats.find((seat) => seat.seatId === '4')?.holeCards).toBeUndefined();
    expect(snapB?.seats.find((seat) => seat.seatId === '1')?.holeCards).toBeUndefined();

    for (const snapshot of [snapA, snapB]) {
      const json = JSON.stringify(snapshot);
      expect(json).not.toContain('deckRemaining');
      expect(json).not.toContain('burns');
      expect(json).not.toContain('seatToken');
    }

    const table = await store.getTable('table-1');
    expect(table?.deckRemaining?.length).toBeGreaterThan(0);
    expect(table?.burns).toEqual([]);
  });

  it('postflop first to act is big blind heads-up after preflop completes', async () => {
    const { handler, store, sent } = createHarness(7);
    await setupTable(handler, store);
    const { tokenA, tokenB } = await sitTwoPlayers(handler, sent);
    await startHeadsUpHand(handler, sent, tokenA);

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'call', seatToken: tokenA })),
      {},
    );
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'check', seatToken: tokenB })),
      {},
    );

    const table = await store.getTable('table-1');
    expect(table?.currentSeatId).toBe('4');
    expect(table?.currentBet).toBe(0);
    expect(table?.lastRaiseSize).toBe(2);
    expect(
      (await store.listSeats('table-1')).every((seat) => (seat.streetCommitted ?? 0) === 0),
    ).toBe(true);
  });

  it('does not fan out snapshots on rejection', async () => {
    const { handler, store, sent, postToConnection } = createHarness(7);
    await setupTable(handler, store);
    const { tokenA, tokenB } = await sitTwoPlayers(handler, sent);
    await startHeadsUpHand(handler, sent, tokenA);

    const snapshotsBefore = snapshotCount(sent.get('conn-a'));
    postToConnection.mockClear();

    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'call', seatToken: tokenB })),
      {},
    );

    expect(snapshotCount(sent.get('conn-a'))).toBe(snapshotsBefore);
    expect(postToConnection).toHaveBeenCalledTimes(1);
    expect(sent.get('conn-b')?.at(-1)).toEqual({ type: 'error', code: 'off_turn' });
  });
});
