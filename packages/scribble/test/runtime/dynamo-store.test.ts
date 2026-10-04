import { describe, expect, it, vi } from 'vitest';
import { createDynamoStore } from '../../src/runtime/dynamo-store.js';
import { newTableRecord, parseTableItem } from '../../src/runtime/table-record.js';

const TABLE = newTableRecord({ tableId: 't1', createdAt: '2026-10-04T00:00:00.000Z', tableName: 'Inkwell' });

describe('dynamo store', () => {
  it('commits the table, seats, and connection bindings in one conditional transaction', async () => {
    const send = vi.fn().mockResolvedValue({});
    const store = createDynamoStore({ send }, 'scribble');
    const ok = await store.commit({
      table: { ...TABLE, version: 2 },
      expectedVersion: 1,
      putSeats: [{ seatId: '1', displayName: 'Clever Quill', avatarId: 3, seatTokenHash: 'ab', rack: [], score: 0 }],
      deleteSeatIds: ['2'],
      connectionSeats: [{ connectionId: 'c1', seatId: '1' }, { connectionId: 'c2', seatId: null }],
    });
    expect(ok).toBe(true);
    const items = send.mock.calls[0]![0].input.TransactItems;
    expect(items[0].Put).toMatchObject({
      Item: { PK: 'TABLE#t1', SK: 'META', version: 2 },
      ConditionExpression: '#version = :expected',
      ExpressionAttributeValues: { ':expected': 1 },
    });
    expect(items[1].Put.Item).toMatchObject({ PK: 'TABLE#t1', SK: 'SEAT#1' });
    expect(items[2].Delete.Key).toEqual({ PK: 'TABLE#t1', SK: 'SEAT#2' });
    expect(items[3].Update).toMatchObject({ Key: { PK: 'CONN#c1', SK: 'META' }, UpdateExpression: 'SET seatId = :seatId' });
    expect(items[4].Update).toMatchObject({ UpdateExpression: 'REMOVE seatId' });
  });

  it('reports a lost race as false rather than throwing', async () => {
    const send = vi.fn().mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'TransactionCanceledException' }));
    const store = createDynamoStore({ send }, 'scribble');
    await expect(
      store.commit({ table: TABLE, expectedVersion: 1, putSeats: [], deleteSeatIds: [], connectionSeats: [] }),
    ).resolves.toBe(false);
  });

  it('round-trips a table record, defaulting fields that older items lack', () => {
    expect(parseTableItem({ PK: 'TABLE#t1', SK: 'META', ...TABLE })).toEqual(TABLE);
    const legacy = parseTableItem({ tableId: 't2', version: 3 });
    expect(legacy).toMatchObject({ visibility: 'public', listed: true, themeId: 'default', maxSeats: 4 });
    expect(legacy.game.status).toBe('waiting');
  });
});
