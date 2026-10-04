import { describe, expect, it } from 'vitest';
import { createRuntimeHandler } from '../../src/runtime/handler.js';
import type { SeatRecord, WebSocketEvent } from '../../src/runtime/types.js';
import { MemoryMatchStore } from '../support/memory-store.js';

const NOW = '2026-09-25T12:00:00.000Z';

function wsEvent(connectionId: string, body: unknown): WebSocketEvent {
  return {
    requestContext: {
      routeKey: '$default',
      connectionId,
      domainName: 'example.execute-api.us-east-1.amazonaws.com',
      stage: 'prod',
    },
    body: JSON.stringify(body),
  };
}

function seat(seatId: string): SeatRecord {
  return {
    seatId,
    displayName: `Player ${seatId}`,
    stack: 2000,
    seatTokenHash: 'hash',
    connectionId: `seat-${seatId}`,
  };
}

async function anchor(
  store: MemoryMatchStore,
  overrides: { tableId?: string; createdAt?: string; groupId?: string } = {},
) {
  return store.createGroupTable({
    tableId: overrides.tableId ?? 'anchor',
    groupId: overrides.groupId ?? 'the-limp',
    tableName: 'The Limp',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    defaultStack: 2000,
    maxSeats: 8,
    blinds: { smallBlind: 1, bigBlind: 2 },
    anchor: true,
  });
}

function harness(store = new MemoryMatchStore(), randomTableId = () => 'overflow-1') {
  const sent = new Map<string, unknown[]>();
  const handler = createRuntimeHandler({
    store,
    postToConnection: async (connectionId, message) => {
      const rows = sent.get(connectionId) ?? [];
      rows.push(message);
      sent.set(connectionId, rows);
    },
    now: () => NOW,
    randomTableId,
    nextHandDelayMs: null,
  });
  return { handler, store, sent };
}

describe('join_group', () => {
  it('picks the fullest table that still has an open seat, oldest first', async () => {
    const { handler, store, sent } = harness();
    await anchor(store, { tableId: 'anchor', createdAt: '2026-01-01T00:00:00.000Z' });
    await store.createGroupTable({
      tableId: 'busy',
      groupId: 'the-limp',
      tableName: 'The Limp',
      createdAt: '2026-06-01T00:00:00.000Z',
      defaultStack: 2000,
      maxSeats: 8,
      blinds: { smallBlind: 1, bigBlind: 2 },
      anchor: false,
    });
    await store.createGroupTable({
      tableId: 'older-pair',
      groupId: 'the-limp',
      tableName: 'The Limp',
      createdAt: '2026-03-01T00:00:00.000Z',
      defaultStack: 2000,
      maxSeats: 8,
      blinds: { smallBlind: 1, bigBlind: 2 },
      anchor: false,
    });
    for (const id of ['1', '2']) {
      await store.putSeat('anchor', seat(id));
    }
    for (const id of ['1', '2', '3', '4', '5', '6']) {
      await store.putSeat('busy', seat(id));
    }
    for (const id of ['1', '2']) {
      await store.putSeat('older-pair', seat(id));
    }

    await handler(wsEvent('conn', { action: 'join_group', groupId: 'the-limp' }), {});

    expect(sent.get('conn')).toEqual([
      { type: 'group_table', groupId: 'the-limp', tableId: 'busy' },
    ]);
  });

  it('creates an overflow table when every table is full', async () => {
    const { handler, store, sent } = harness();
    await anchor(store);
    for (const id of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      await store.putSeat('anchor', seat(id));
    }

    await handler(wsEvent('conn', { action: 'join_group', groupId: 'the-limp' }), {});

    expect(sent.get('conn')).toEqual([
      { type: 'group_table', groupId: 'the-limp', tableId: 'overflow-1' },
    ]);
    const created = await store.getTable('overflow-1');
    expect(created).toMatchObject({
      groupId: 'the-limp',
      tableName: 'The Limp',
      defaultStack: 2000,
      maxSeats: 8,
      blinds: { smallBlind: 1, bigBlind: 2 },
    });
    const memberships = await store.listGroupTables('the-limp');
    expect(memberships.map((row) => row.tableId).sort()).toEqual(['anchor', 'overflow-1']);
    expect(memberships.find((row) => row.tableId === 'overflow-1')?.anchor).toBe(false);
  });

  it('rejects an unknown group', async () => {
    const { handler, sent } = harness();
    await handler(wsEvent('conn', { action: 'join_group', groupId: 'the-limp' }), {});
    await handler(wsEvent('conn', { action: 'join_group', groupId: 'not a slug' }), {});
    expect(sent.get('conn')).toEqual([
      { type: 'error', code: 'group_not_found' },
      { type: 'error', code: 'group_not_found' },
    ]);
  });
});

describe('list_groups', () => {
  it('reports players, table count, and the next table a player would join', async () => {
    const { handler, store, sent } = harness();
    await anchor(store);
    await store.createGroupTable({
      tableId: 'overflow',
      groupId: 'the-limp',
      tableName: 'The Limp',
      createdAt: '2026-06-01T00:00:00.000Z',
      defaultStack: 2000,
      maxSeats: 8,
      blinds: { smallBlind: 1, bigBlind: 2 },
      anchor: false,
    });
    await store.putSeat('anchor', seat('1'));
    await store.putSeat('overflow', seat('1'));
    await store.putSeat('overflow', seat('2'));
    await store.putSeat('overflow', seat('3'));

    await handler(wsEvent('conn', { action: 'list_groups', groupIds: ['the-limp', 'missing-group'] }), {});

    expect(sent.get('conn')).toEqual([
      {
        type: 'group_list',
        groups: [{ groupId: 'the-limp', seatedCount: 4, tableCount: 2, nextTableSeated: 3 }],
      },
    ]);
  });
});
