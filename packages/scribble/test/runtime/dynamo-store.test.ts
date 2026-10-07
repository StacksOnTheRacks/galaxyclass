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

  it('creates a table and its owner membership in one transaction that never overwrites', async () => {
    const send = vi.fn().mockResolvedValue({});
    const store = createDynamoStore({ send }, 'scribble');
    await store.createTable(TABLE, { playerSub: 'sub-1', tableId: 't1', role: 'owner', joinedAt: '2026-10-04T00:00:00.000Z' });
    const items = send.mock.calls[0]![0].input.TransactItems;
    expect(items[0].Put).toMatchObject({ Item: { PK: 'TABLE#t1', SK: 'META' }, ConditionExpression: 'attribute_not_exists(PK)' });
    expect(items[1].Put.Item).toEqual({
      PK: 'MEMBER#sub-1',
      SK: 'TABLE#t1',
      GSI1PK: 'TABLE#t1',
      GSI1SK: 'MEMBER#sub-1',
      playerSub: 'sub-1',
      tableId: 't1',
      role: 'owner',
      joinedAt: '2026-10-04T00:00:00.000Z',
    });
  });

  it('keeps the first membership when a member opens the link again', async () => {
    const send = vi.fn().mockRejectedValue(Object.assign(new Error('exists'), { name: 'ConditionalCheckFailedException' }));
    const store = createDynamoStore({ send }, 'scribble');
    await expect(
      store.addMembership({ playerSub: 'sub-1', tableId: 't1', role: 'member', joinedAt: '2026-10-05T00:00:00.000Z' }),
    ).resolves.toBeUndefined();
    expect(send.mock.calls[0]![0].input.ConditionExpression).toBe('attribute_not_exists(PK)');
  });

  it('pages through a member’s tables and drops malformed items', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Items: [{ playerSub: 'sub-1', tableId: 't1', role: 'owner', joinedAt: 'a' }, { junk: true }],
        LastEvaluatedKey: { PK: 'MEMBER#sub-1', SK: 'TABLE#t1' },
      })
      .mockResolvedValueOnce({ Items: [{ playerSub: 'sub-1', tableId: 't2', role: 'nope', joinedAt: 'b' }] });
    const store = createDynamoStore({ send }, 'scribble');
    await expect(store.listMemberships('sub-1')).resolves.toEqual([
      { playerSub: 'sub-1', tableId: 't1', role: 'owner', joinedAt: 'a' },
      { playerSub: 'sub-1', tableId: 't2', role: 'member', joinedAt: 'b' },
    ]);
    expect(send.mock.calls[0]![0].input.ExpressionAttributeValues).toEqual({ ':pk': 'MEMBER#sub-1', ':prefix': 'TABLE#' });
    expect(send.mock.calls[1]![0].input.ExclusiveStartKey).toEqual({ PK: 'MEMBER#sub-1', SK: 'TABLE#t1' });
  });

  it('finds a table’s watchers and members apart on the shared byTable index', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Items: [{ connectionId: 'c1' }] })
      .mockResolvedValueOnce({ Items: [{ playerSub: 'sub-1' }, { junk: true }], LastEvaluatedKey: { k: 1 } })
      .mockResolvedValueOnce({ Items: [{ playerSub: 'sub-2' }] });
    const store = createDynamoStore({ send }, 'scribble');
    await expect(store.listConnectionsForTable('t1')).resolves.toEqual(['c1']);
    await expect(store.listTableMembers('t1')).resolves.toEqual(['sub-1', 'sub-2']);
    const [conns, members, more] = send.mock.calls.map((call) => call[0].input);
    expect(conns).toMatchObject({ IndexName: 'byTable', ExpressionAttributeValues: { ':gsiPk': 'TABLE#t1', ':prefix': 'CONN#' } });
    expect(members).toMatchObject({ IndexName: 'byTable', ExpressionAttributeValues: { ':gsiPk': 'TABLE#t1', ':prefix': 'MEMBER#' } });
    expect(more.ExclusiveStartKey).toEqual({ k: 1 });
  });

  it('deletes a table and its seats in one transaction conditioned on the version', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Items: [{ seatId: '1', displayName: 'A', seatTokenHash: 'x' }, { seatId: '3', displayName: 'B', seatTokenHash: 'y' }] })
      .mockResolvedValueOnce({});
    const store = createDynamoStore({ send }, 'scribble');
    await expect(store.deleteTable('t1', 7)).resolves.toBe(true);
    const items = send.mock.calls[1]![0].input.TransactItems;
    expect(items[0].Delete).toMatchObject({
      Key: { PK: 'TABLE#t1', SK: 'META' },
      ConditionExpression: '#version = :expected',
      ExpressionAttributeValues: { ':expected': 7 },
    });
    expect(items.slice(1).map((item: { Delete: { Key: unknown } }) => item.Delete.Key)).toEqual([
      { PK: 'TABLE#t1', SK: 'SEAT#1' },
      { PK: 'TABLE#t1', SK: 'SEAT#3' },
    ]);

    const lost = vi
      .fn()
      .mockResolvedValueOnce({ Items: [] })
      .mockRejectedValueOnce(Object.assign(new Error('cancelled'), { name: 'TransactionCanceledException' }));
    await expect(createDynamoStore({ send: lost }, 'scribble').deleteTable('t1', 7)).resolves.toBe(false);
  });

  it('round-trips a table record, defaulting fields that older items lack', () => {
    expect(parseTableItem({ PK: 'TABLE#t1', SK: 'META', ...TABLE })).toEqual(TABLE);
    const legacy = parseTableItem({ tableId: 't2', version: 3 });
    expect(legacy).toMatchObject({ visibility: 'public', listed: true, themeId: 'default', maxSeats: 4 });
    expect(legacy.game.status).toBe('waiting');
  });
});
