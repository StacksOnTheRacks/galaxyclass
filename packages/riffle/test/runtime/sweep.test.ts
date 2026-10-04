import { describe, expect, it } from 'vitest';
import { sweepGroups } from '../../src/runtime/sweep.js';
import type { SeatRecord } from '../../src/runtime/types.js';
import { MemoryMatchStore } from '../support/memory-store.js';

const NOW = '2026-09-25T12:00:00.000Z';
const OLD = '2026-09-25T10:00:00.000Z';
const YOUNG = '2026-09-25T11:50:00.000Z';

function seat(seatId: string, overrides: Partial<SeatRecord> = {}): SeatRecord {
  return {
    seatId,
    displayName: `Player ${seatId}`,
    stack: 2000,
    seatTokenHash: 'hash',
    connectionId: `seat-${seatId}`,
    ...overrides,
  };
}

async function addTable(
  store: MemoryMatchStore,
  tableId: string,
  createdAt: string,
  anchor: boolean,
) {
  await store.createGroupTable({
    tableId,
    groupId: 'the-limp',
    tableName: 'The Limp',
    createdAt,
    defaultStack: 2000,
    maxSeats: 8,
    blinds: { smallBlind: 1, bigBlind: 2 },
    anchor,
  });
}

describe('sweepGroups', () => {
  it('deletes idle overflow tables and keeps the anchor plus live tables', async () => {
    const store = new MemoryMatchStore();
    await addTable(store, 'anchor', OLD, true);
    await addTable(store, 'idle', OLD, false);
    await addTable(store, 'young', YOUNG, false);
    await addTable(store, 'seated', OLD, false);
    await addTable(store, 'watched', OLD, false);
    await addTable(store, 'away', OLD, false);
    await store.putSeat('seated', seat('1'));
    await store.putSeat(
      'away',
      seat('1', { connectionId: undefined, awaySince: '2026-09-25T11:00:00.000Z' }),
    );
    await store.putConnection('viewer');
    await store.bindConnectionToTable('viewer', 'watched');

    const deleted = await sweepGroups({
      store,
      now: NOW,
      groupIds: ['the-limp', 'the-button'],
    });

    expect(deleted.sort()).toEqual(['away', 'idle']);
    expect(await store.getTable('anchor')).not.toBeNull();
    expect(await store.getTable('young')).not.toBeNull();
    expect(await store.getTable('seated')).not.toBeNull();
    expect(await store.getTable('watched')).not.toBeNull();
    expect(await store.getTable('idle')).toBeNull();
    expect((await store.listGroupTables('the-limp')).map((row) => row.tableId).sort()).toEqual([
      'anchor',
      'seated',
      'watched',
      'young',
    ]);
  });
});
