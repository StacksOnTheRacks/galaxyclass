import { describe, expect, it } from 'vitest';
import { createRuntimeHandler } from '../src/runtime/handler.js';
import { buildSeatScopedSnapshot } from '../src/runtime/snapshot.js';
import type { MatchStore } from '../src/runtime/store.js';
import type {
  ConnectionRecord,
  OutboundMessage,
  SeatRecord,
  TableRecord,
  WebSocketEvent,
} from '../src/runtime/types.js';

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

  listSeatsForTable(tableId: string): SeatRecord[] {
    return [...this.seats.entries()]
      .filter(([key]) => key.startsWith(`${tableId}:`))
      .map(([, seat]) => seat)
      .sort((a, b) => Number(a.seatId) - Number(b.seatId));
  }
}

function createHarness(rngSeed = 42, nextHandDelayMs: number | null = null) {
  const store = new MemoryStore();
  const sent = new Map<string, OutboundMessage[]>();

  const handler = createRuntimeHandler({
    store,
    postToConnection: async (connectionId, message) => {
      const rows = sent.get(connectionId) ?? [];
      rows.push(message);
      sent.set(connectionId, rows);
    },
    now: () => '2026-09-25T12:00:00.000Z',
    rngSeed: () => rngSeed,
    nextHandDelayMs,
  });

  return { handler, store, sent };
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

describe('sit, leave, and start_hand', () => {
  it('sit assigns an open seat, returns a seat token, and sets starting stack', async () => {
    const { handler, store, sent } = createHarness();
    await setupTable(handler, store);

    await handler(
      wsEvent(
        '$default',
        'conn-a',
        JSON.stringify({ action: 'sit', seatId: '1', displayName: 'Alice' }),
      ),
      {},
    );

    const sat = sent.get('conn-a')?.find((message) => message.type === 'sat');
    expect(sat).toMatchObject({ type: 'sat', seatId: '1' });
    expect(sat).toHaveProperty('seatToken');
    expect(typeof (sat as { seatToken: string }).seatToken).toBe('string');

    const snapshot = lastSnapshot(sent.get('conn-a'));
    expect(snapshot).toMatchObject({
      seatedPlayersLabel: '1 / 8',
      blindsLabel: '$1 / $2',
    });
    expect(snapshot?.seats).toEqual([
      expect.objectContaining({
        seatId: '1',
        // Guests are named by the server; the client's "Alice" is ignored.
        displayName: expect.stringMatching(/^\S+ \S+$/),
        stack: 2000,
        isLocal: true,
      }),
    ]);
    expect(snapshot).not.toHaveProperty('seatToken');
  });

  it('rejects sit when seat occupied, caller seated, or table full', async () => {
    const { handler, store, sent } = createHarness();
    await setupTable(handler, store);

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'sit', seatId: '1', displayName: 'Alice' })),
      {},
    );
    const versionAfterFirstSit = (await store.getTable('table-1'))?.version;

    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'sit', seatId: '1', displayName: 'Bob' })),
      {},
    );
    expect(sent.get('conn-b')?.at(-1)).toEqual({ type: 'error', code: 'seat_occupied' });

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'sit', seatId: '2', displayName: 'Alice2' })),
      {},
    );
    expect(sent.get('conn-a')?.at(-1)).toEqual({ type: 'error', code: 'already_seated' });
    expect((await store.getTable('table-1'))?.version).toBe(versionAfterFirstSit);

    for (let seatId = 2; seatId <= 8; seatId += 1) {
      const connId = `conn-fill-${seatId}`;
      await handler(wsEvent('$connect', connId), {});
      await handler(
        wsEvent('$default', connId, JSON.stringify({ action: 'join_table', tableId: 'table-1' })),
        {},
      );
      await handler(
        wsEvent(
          '$default',
          connId,
          JSON.stringify({ action: 'sit', seatId: String(seatId), displayName: `Player ${seatId}` }),
        ),
        {},
      );
    }

    await handler(wsEvent('$connect', 'conn-full'), {});
    await handler(
      wsEvent('$default', 'conn-full', JSON.stringify({ action: 'join_table', tableId: 'table-1' })),
      {},
    );
    const versionBeforeFull = (await store.getTable('table-1'))?.version;
    await handler(
      wsEvent('$default', 'conn-full', JSON.stringify({ action: 'sit', seatId: '1', displayName: 'Overflow' })),
      {},
    );
    expect(sent.get('conn-full')?.at(-1)).toEqual({ type: 'error', code: 'table_full' });
    expect((await store.getTable('table-1'))?.version).toBe(versionBeforeFull);
  });

  it('ignores client-supplied names and avatars and gives each guest a distinct server-picked name', async () => {
    const { handler, store } = createHarness();
    await setupTable(handler, store);

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'sit', seatId: '1', displayName: 'Ann', avatarId: 5 })),
      {},
    );
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'sit', seatId: '2', displayName: 'Ann' })),
      {},
    );
    const first = await store.getSeat('table-1', '1');
    const second = await store.getSeat('table-1', '2');
    expect(first?.displayName).not.toBe('Ann');
    expect(second?.displayName).not.toBe('Ann');
    expect(first?.displayName.toLowerCase()).not.toBe(second?.displayName.toLowerCase());
  });

  it('leave between hands frees the seat; leave mid-hand folds and frees it after the hand', async () => {
    const { handler, store, sent } = createHarness(99);
    await setupTable(handler, store);

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'sit', seatId: '1', displayName: 'Alice' })),
      {},
    );
    const tokenA = (sent.get('conn-a')?.find((m) => m.type === 'sat') as { seatToken: string }).seatToken;

    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'sit', seatId: '3', displayName: 'Bob' })),
      {},
    );
    const tokenB = (sent.get('conn-b')?.find((m) => m.type === 'sat') as { seatToken: string }).seatToken;
    expect((await store.getTable('table-1'))?.status).toBe('hand_in_progress');

    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'leave', seatToken: tokenB })),
      {},
    );
    expect((await store.getConnection('conn-b'))?.seatId).toBeUndefined();
    const departing = await store.getSeat('table-1', '3');
    expect(departing?.leaveAfterHand).toBe(true);
    expect(departing?.connectionId).toBeUndefined();
    expect(lastSnapshot(sent.get('conn-b'))?.seats.some((seat) => seat.isLocal)).toBe(false);

    // Alice (button) acts first; the action then reaches departed Bob, who is folded.
    await handler(wsEvent('$default', 'conn-a', JSON.stringify({ action: 'call', seatToken: tokenA })), {});
    const finished = await store.getTable('table-1');
    expect(finished?.phase).toBe('complete');
    expect(finished?.completeReason).toBe('fold_to_one');

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'start_hand', seatToken: tokenA })),
      {},
    );
    expect(await store.getSeat('table-1', '3')).toBeNull();
    expect(lastSnapshot(sent.get('conn-a'))?.seatedPlayersLabel).toBe('1 / 8');
    expect(sent.get('conn-a')?.at(-1)).toEqual({ type: 'error', code: 'insufficient_players' });

    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'sit', seatId: '3', displayName: 'Bob' })),
      {},
    );
    const tokenB2 = (sent.get('conn-b')?.filter((m) => m.type === 'sat').at(-1) as { seatToken: string })
      .seatToken;
    expect(tokenB2).not.toBe(tokenB);

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'leave', seatToken: tokenA })),
      {},
    );
    expect(await store.getSeat('table-1', '1')).toBeNull();
    expect((await store.getConnection('conn-a'))?.seatId).toBeUndefined();
    expect(lastSnapshot(sent.get('conn-b'))?.seatedPlayersLabel).toBe('1 / 8');
  });

  it('deals as soon as a second player sits', async () => {
    const { handler, store, sent } = createHarness(7);
    await setupTable(handler, store);

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'sit', seatId: '1', displayName: 'Alice' })),
      {},
    );
    expect((await store.getTable('table-1'))?.status).toBe('open');

    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'sit', seatId: '4', displayName: 'Bob' })),
      {},
    );
    const snapshot = lastSnapshot(sent.get('conn-a'));
    expect(snapshot).toMatchObject({ status: 'hand_in_progress', handNumber: 1, street: 'preflop' });
    expect(snapshot?.pocketCards).toHaveLength(2);
  });

  it('seats a player who arrives mid-hand without cards and deals them into the next hand', async () => {
    const { handler, store, sent } = createHarness(11, 0);
    await setupTable(handler, store);

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'sit', seatId: '2', displayName: 'Alice' })),
      {},
    );
    const tokenA = (sent.get('conn-a')?.find((m) => m.type === 'sat') as { seatToken: string }).seatToken;
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'sit', seatId: '5', displayName: 'Bob' })),
      {},
    );
    await handler(wsEvent('$connect', 'conn-c'), {});
    await handler(
      wsEvent('$default', 'conn-c', JSON.stringify({ action: 'join_table', tableId: 'table-1' })),
      {},
    );
    await handler(
      wsEvent('$default', 'conn-c', JSON.stringify({ action: 'sit', seatId: '7', displayName: 'Carol' })),
      {},
    );

    expect(sent.get('conn-c')?.some((m) => m.type === 'sat')).toBe(true);
    const waiting = lastSnapshot(sent.get('conn-c'));
    expect(waiting?.handNumber).toBe(1);
    expect(waiting?.pocketCards).toBeUndefined();
    expect(waiting?.seats.find((seat) => seat.seatId === '7')).toMatchObject({
      isLocal: true,
      inHand: false,
      waitingForNextHand: true,
    });
    expect((await store.getSeat('table-1', '7'))?.hole).toBeUndefined();

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'fold', seatToken: tokenA })),
      {},
    );

    const next = lastSnapshot(sent.get('conn-c'));
    expect(next).toMatchObject({ handNumber: 2, buttonSeatId: '5', currentSeatId: '5', pot: 3 });
    expect(next?.pocketCards).toHaveLength(2);
    expect(next?.seats.find((seat) => seat.seatId === '5')).toMatchObject({ position: 'D', acting: true });
    expect(next?.seats.find((seat) => seat.seatId === '7')).toMatchObject({ position: 'SB' });
    expect(next?.seats.find((seat) => seat.seatId === '2')).toMatchObject({ position: 'BB' });
    const finishedSnapshots = sent
      .get('conn-c')
      ?.filter((m) => m.type === 'table_snapshot' && m.phase === 'complete');
    expect(finishedSnapshots?.length).toBeGreaterThan(0);
  });

  it('does not let a newcomer take an away seat that is still in the hand', async () => {
    const { handler, store, sent } = createHarness(7);
    await setupTable(handler, store);
    for (const [conn, seatId, name] of [
      ['conn-a', '1', 'Alice'],
      ['conn-b', '4', 'Bob'],
    ] as const) {
      await handler(wsEvent('$default', conn, JSON.stringify({ action: 'sit', seatId, displayName: name })), {});
    }
    await handler(wsEvent('$connect', 'conn-c'), {});
    await handler(wsEvent('$connect', 'conn-d'), {});
    for (const conn of ['conn-c', 'conn-d']) {
      await handler(wsEvent('$default', conn, JSON.stringify({ action: 'join_table', tableId: 'table-1' })), {});
    }
    // Carol sits mid-hand with no cards, then drops: her away seat is free to take.
    await handler(
      wsEvent('$default', 'conn-c', JSON.stringify({ action: 'sit', seatId: '6', displayName: 'Carol' })),
      {},
    );
    await handler(wsEvent('$disconnect', 'conn-c'), {});
    await handler(
      wsEvent('$default', 'conn-d', JSON.stringify({ action: 'sit', seatId: '6', displayName: 'Dave' })),
      {},
    );
    expect((await store.getSeat('table-1', '6'))?.connectionId).toBe('conn-d');
    const bobName = (await store.getSeat('table-1', '4'))?.displayName;

    // Seat 1 (the button) acts first heads-up, so Bob in seat 4 stays in the hand while away.
    expect((await store.getTable('table-1'))?.currentSeatId).toBe('1');
    await handler(wsEvent('$disconnect', 'conn-b'), {});
    await handler(wsEvent('$connect', 'conn-e'), {});
    await handler(wsEvent('$default', 'conn-e', JSON.stringify({ action: 'join_table', tableId: 'table-1' })), {});
    await handler(
      wsEvent('$default', 'conn-e', JSON.stringify({ action: 'sit', seatId: '4', displayName: 'Eve' })),
      {},
    );
    expect(sent.get('conn-e')?.at(-1)).toEqual({ type: 'error', code: 'seat_occupied' });
    expect((await store.getSeat('table-1', '4'))?.displayName).toBe(bobName);
  });

  it('returns the table to open after the hand when only one player can continue', async () => {
    const { handler, store, sent } = createHarness(7, 0);
    await setupTable(handler, store);
    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'sit', seatId: '1', displayName: 'Alice' })),
      {},
    );
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'sit', seatId: '4', displayName: 'Bob' })),
      {},
    );
    const tokenB = (sent.get('conn-b')?.find((m) => m.type === 'sat') as { seatToken: string }).seatToken;

    const tokenA = (sent.get('conn-a')?.find((m) => m.type === 'sat') as { seatToken: string }).seatToken;
    await handler(wsEvent('$default', 'conn-b', JSON.stringify({ action: 'leave', seatToken: tokenB })), {});
    await handler(wsEvent('$default', 'conn-a', JSON.stringify({ action: 'call', seatToken: tokenA })), {});

    const table = await store.getTable('table-1');
    expect(table).toMatchObject({ status: 'open', handNumber: 1, pot: 0, winners: null });
    expect(await store.getSeat('table-1', '4')).toBeNull();
    const snapshot = lastSnapshot(sent.get('conn-a'));
    expect(snapshot).toMatchObject({ status: 'open', seatedPlayersLabel: '1 / 8' });
    expect(snapshot?.seats.find((seat) => seat.seatId === '1')?.wonAmount).toBeUndefined();
  });

  it('rejects start_hand with fewer than two players, while in progress, or from non-seated caller', async () => {
    const { handler, store, sent } = createHarness();
    await setupTable(handler, store);

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'sit', seatId: '1', displayName: 'Alice' })),
      {},
    );
    const tokenA = (sent.get('conn-a')?.find((m) => m.type === 'sat') as { seatToken: string }).seatToken;
    const versionBefore = (await store.getTable('table-1'))?.version;

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'start_hand', seatToken: tokenA })),
      {},
    );
    expect(sent.get('conn-a')?.at(-1)).toEqual({ type: 'error', code: 'insufficient_players' });

    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'start_hand', seatToken: 'fake-token' })),
      {},
    );
    expect(sent.get('conn-b')?.at(-1)).toEqual({ type: 'error', code: 'not_seated' });

    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'sit', seatId: '2', displayName: 'Bob' })),
      {},
    );
    const tokenB = (sent.get('conn-b')?.find((m) => m.type === 'sat') as { seatToken: string }).seatToken;

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'start_hand', seatToken: tokenA })),
      {},
    );
    expect((await store.getTable('table-1'))?.status).toBe('hand_in_progress');

    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'start_hand', seatToken: tokenB })),
      {},
    );
    expect(sent.get('conn-b')?.at(-1)).toEqual({ type: 'error', code: 'hand_in_progress' });
    expect((await store.getTable('table-1'))?.version).toBeGreaterThan(versionBefore!);
  });

  it('heads-up assigns button as SB and first-to-act as button', async () => {
    const { handler, store, sent } = createHarness(7);
    await setupTable(handler, store);

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'sit', seatId: '1', displayName: 'Alice' })),
      {},
    );
    const tokenA = (sent.get('conn-a')?.find((m) => m.type === 'sat') as { seatToken: string }).seatToken;
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'sit', seatId: '4', displayName: 'Bob' })),
      {},
    );

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'start_hand', seatToken: tokenA })),
      {},
    );

    const snapA = lastSnapshot(sent.get('conn-a'));
    const snapB = lastSnapshot(sent.get('conn-b'));

    expect(snapA).toMatchObject({
      handNumber: 1,
      street: 'preflop',
      pot: 3,
      buttonSeatId: '1',
      currentSeatId: '1',
      blindsLabel: '$1 / $2',
      seatedPlayersLabel: '2 / 8',
    });

    expect(snapA?.seats.find((seat) => seat.seatId === '1')).toMatchObject({
      position: 'D',
      acting: true,
      stack: 1999,
    });
    expect(snapA?.seats.find((seat) => seat.seatId === '4')).toMatchObject({
      position: 'BB',
      stack: 1998,
    });
    expect(snapB?.seats.find((seat) => seat.seatId === '1')).toMatchObject({ position: 'D' });
    expect(snapB?.seats.find((seat) => seat.seatId === '4')).toMatchObject({ position: 'BB' });
  });

  it('three or more players assign SB left of button, BB left of SB, first-to-act left of BB', async () => {
    const { handler, store, sent } = createHarness(11, 0);
    await setupTable(handler, store);

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'sit', seatId: '2', displayName: 'Alice' })),
      {},
    );
    await handler(wsEvent('$connect', 'conn-c'), {});
    await handler(
      wsEvent('$default', 'conn-c', JSON.stringify({ action: 'join_table', tableId: 'table-1' })),
      {},
    );
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'sit', seatId: '5', displayName: 'Bob' })),
      {},
    );
    await handler(
      wsEvent('$default', 'conn-c', JSON.stringify({ action: 'sit', seatId: '7', displayName: 'Carol' })),
      {},
    );
    // Heads-up hand 1 (button 2 acts first); folding deals hand 2 with all three.
    const tokenA = (sent.get('conn-a')?.find((m) => m.type === 'sat') as { seatToken: string }).seatToken;
    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'fold', seatToken: tokenA })),
      {},
    );

    const snapshot = lastSnapshot(sent.get('conn-a'));
    expect(snapshot).toMatchObject({
      handNumber: 2,
      buttonSeatId: '5',
      currentSeatId: '5',
      pot: 3,
    });
    expect(snapshot?.seats.find((seat) => seat.seatId === '5')).toMatchObject({
      position: 'D',
      acting: true,
    });
    expect(snapshot?.seats.find((seat) => seat.seatId === '7')).toMatchObject({ position: 'SB' });
    expect(snapshot?.seats.find((seat) => seat.seatId === '2')).toMatchObject({ position: 'BB' });
  });

  it('includes two hole faces only on the owning seat snapshot', async () => {
    const { handler, store, sent } = createHarness(5);
    await setupTable(handler, store);

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'sit', seatId: '1', displayName: 'Alice' })),
      {},
    );
    const tokenA = (sent.get('conn-a')?.find((m) => m.type === 'sat') as { seatToken: string }).seatToken;
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'sit', seatId: '2', displayName: 'Bob' })),
      {},
    );

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'start_hand', seatToken: tokenA })),
      {},
    );

    const snapA = lastSnapshot(sent.get('conn-a'));
    const snapB = lastSnapshot(sent.get('conn-b'));

    expect(snapA?.pocketCards).toHaveLength(2);
    expect(snapB?.pocketCards).toHaveLength(2);
    expect(snapA?.pocketCards).not.toEqual(snapB?.pocketCards);

    for (const snapshot of [snapA, snapB]) {
      expect(JSON.stringify(snapshot)).not.toContain('seatToken');
      for (const seat of snapshot?.seats ?? []) {
        expect(seat).not.toHaveProperty('hole');
        expect(seat).not.toHaveProperty('holeCards');
      }
    }
  });

  it('rejects client-supplied stack or deal fields on sit and start_hand', async () => {
    const { handler, store, sent } = createHarness();
    await setupTable(handler, store);

    await handler(
      wsEvent(
        '$default',
        'conn-a',
        JSON.stringify({ action: 'sit', seatId: '1', displayName: 'Alice', stack: 9999 }),
      ),
      {},
    );
    expect(sent.get('conn-a')?.at(-1)).toEqual({ type: 'error', code: 'client_supplied_state' });
    expect(await store.getSeat('table-1', '1')).toBeNull();

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'sit', seatId: '1', displayName: 'Alice' })),
      {},
    );
    const tokenA = (sent.get('conn-a')?.find((m) => m.type === 'sat') as { seatToken: string }).seatToken;
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'sit', seatId: '2', displayName: 'Bob' })),
      {},
    );

    const before = await store.getTable('table-1');
    await handler(
      wsEvent(
        '$default',
        'conn-a',
        JSON.stringify({ action: 'start_hand', seatToken: tokenA, pot: 500, hole: ['As', 'Ah'] }),
      ),
      {},
    );
    expect(sent.get('conn-a')?.at(-1)).toEqual({ type: 'error', code: 'client_supplied_state' });
    expect((await store.getTable('table-1'))?.version).toBe(before?.version);
    expect((await store.getTable('table-1'))?.pot).toBe(before?.pot);
  });

  it('public snapshots never include seat tokens', async () => {
    const { handler, store, sent } = createHarness(3);
    await setupTable(handler, store);

    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'sit', seatId: '1', displayName: 'Alice' })),
      {},
    );
    const tokenA = (sent.get('conn-a')?.find((m) => m.type === 'sat') as { seatToken: string }).seatToken;
    await handler(
      wsEvent('$default', 'conn-b', JSON.stringify({ action: 'sit', seatId: '2', displayName: 'Bob' })),
      {},
    );
    await handler(
      wsEvent('$default', 'conn-a', JSON.stringify({ action: 'start_hand', seatToken: tokenA })),
      {},
    );

    const table = await store.getTable('table-1');
    const seats = store.listSeatsForTable('table-1');
    const publicSnapshot = buildSeatScopedSnapshot(table!, seats, null);
    expect(JSON.stringify(publicSnapshot)).not.toContain('seatToken');
    expect(publicSnapshot.pocketCards).toBeUndefined();
  });
});
