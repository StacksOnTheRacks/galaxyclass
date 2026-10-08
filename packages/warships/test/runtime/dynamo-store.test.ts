import { describe, expect, it, vi } from 'vitest';
import { beginPlacing } from '../../src/rules/game.js';
import { createDynamoStore } from '../../src/runtime/dynamo-store.js';
import { newTableRecord, parseTableItem } from '../../src/runtime/table-record.js';
import { A_FLEET } from '../support/fleets.js';

const TABLE = newTableRecord({ tableId: 't1', createdAt: '2026-10-08T00:00:00.000Z', tableName: 'Pacific', createdBy: 'sub-1' });

const commandName = (call: unknown[]) => (call[0] as { constructor: { name: string } }).constructor.name;

describe('dynamo store', () => {
  it('commits the table, seats, and connection bindings in one conditional transaction', async () => {
    const send = vi.fn().mockResolvedValue({});
    const store = createDynamoStore({ send }, 'scribble');
    const ok = await store.commit({
      table: { ...TABLE, version: 2 },
      expectedVersion: 1,
      putSeats: [{ seatId: '1', displayName: 'Admiral', avatarId: 3, seatTokenHash: 'ab' }],
      deleteSeatIds: ['2'],
      connectionSeats: [
        { connectionId: 'c1', seatId: '1' },
        { connectionId: 'c2', seatId: null },
      ],
    });
    expect(ok).toBe(true);
    expect(commandName(send.mock.calls[0]!)).toBe('TransactWriteCommand');
    const items = send.mock.calls[0]![0].input.TransactItems;
    expect(items[0].Put).toMatchObject({
      Item: { PK: 'WS#TABLE#t1', SK: 'META', version: 2 },
      ConditionExpression: '#version = :expected',
      ExpressionAttributeValues: { ':expected': 1 },
    });
    expect(items[1].Put.Item).toEqual({
      PK: 'WS#TABLE#t1',
      SK: 'SEAT#1',
      seatId: '1',
      displayName: 'Admiral',
      avatarId: 3,
      seatTokenHash: 'ab',
    });
    expect(items[2].Delete.Key).toEqual({ PK: 'WS#TABLE#t1', SK: 'SEAT#2' });
    expect(items[3].Update).toMatchObject({ Key: { PK: 'WS#CONN#c1', SK: 'META' }, UpdateExpression: 'SET seatId = :seatId' });
    expect(items[4].Update).toMatchObject({ UpdateExpression: 'REMOVE seatId' });
  });

  it('writes a meta-only change (a shot, a fleet, a vote) as a single conditional put', async () => {
    const send = vi.fn().mockResolvedValue({});
    const store = createDynamoStore({ send }, 'scribble');
    await store.commit({ table: { ...TABLE, version: 5 }, expectedVersion: 4, putSeats: [], deleteSeatIds: [], connectionSeats: [] });
    expect(send).toHaveBeenCalledTimes(1);
    expect(commandName(send.mock.calls[0]!)).toBe('PutCommand');
    expect(send.mock.calls[0]![0].input).toMatchObject({
      TableName: 'scribble',
      Item: { PK: 'WS#TABLE#t1', SK: 'META', version: 5 },
      ConditionExpression: '#version = :expected',
      ExpressionAttributeNames: { '#version': 'version' },
      ExpressionAttributeValues: { ':expected': 4 },
    });
  });

  it('reports a lost race as false rather than throwing, on either path', async () => {
    const cancelled = vi.fn().mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'TransactionCanceledException' }));
    await expect(
      createDynamoStore({ send: cancelled }, 'scribble').commit({
        table: TABLE,
        expectedVersion: 1,
        putSeats: [],
        deleteSeatIds: ['1'],
        connectionSeats: [],
      }),
    ).resolves.toBe(false);
    const conditional = vi.fn().mockRejectedValue(Object.assign(new Error('stale'), { name: 'ConditionalCheckFailedException' }));
    await expect(
      createDynamoStore({ send: conditional }, 'scribble').commit({
        table: TABLE,
        expectedVersion: 1,
        putSeats: [],
        deleteSeatIds: [],
        connectionSeats: [],
      }),
    ).resolves.toBe(false);
    const broken = vi.fn().mockRejectedValue(new Error('throttled'));
    await expect(
      createDynamoStore({ send: broken }, 'scribble').commit({
        table: TABLE,
        expectedVersion: 1,
        putSeats: [],
        deleteSeatIds: [],
        connectionSeats: [],
      }),
    ).rejects.toThrow('throttled');
  });

  it('creates a table and its owner membership in one transaction that never overwrites', async () => {
    const send = vi.fn().mockResolvedValue({});
    const store = createDynamoStore({ send }, 'scribble');
    await store.createTable(TABLE, { playerSub: 'sub-1', tableId: 't1', role: 'owner', joinedAt: '2026-10-08T00:00:00.000Z' });
    const items = send.mock.calls[0]![0].input.TransactItems;
    expect(items[0].Put).toMatchObject({ Item: { PK: 'WS#TABLE#t1', SK: 'META' }, ConditionExpression: 'attribute_not_exists(PK)' });
    expect(items[1].Put.Item).toEqual({
      PK: 'WS#MEMBER#sub-1',
      SK: 'TABLE#t1',
      GSI1PK: 'WS#TABLE#t1',
      GSI1SK: 'MEMBER#sub-1',
      playerSub: 'sub-1',
      tableId: 't1',
      role: 'owner',
      joinedAt: '2026-10-08T00:00:00.000Z',
    });
  });

  it('binds a connection to a table on the byTable index under WS#', async () => {
    const send = vi.fn().mockResolvedValue({});
    await createDynamoStore({ send }, 'scribble').bindConnectionToTable('c1', 't1', 'sub-1');
    expect(send.mock.calls[0]![0].input).toMatchObject({
      Key: { PK: 'WS#CONN#c1', SK: 'META' },
      ExpressionAttributeValues: { ':tableId': 't1', ':playerSub': 'sub-1', ':gsiPk': 'WS#TABLE#t1', ':gsiSk': 'CONN#c1' },
    });
  });

  it('reads back the member a connection joined as', async () => {
    const send = vi.fn().mockResolvedValue({ Item: { connectionId: 'c1', tableId: 't1', seatId: '2', playerSub: 'sub-1' } });
    await expect(createDynamoStore({ send }, 'scribble').getConnection('c1')).resolves.toEqual({
      connectionId: 'c1',
      tableId: 't1',
      seatId: '2',
      playerSub: 'sub-1',
    });
  });

  it('keeps the first membership when a member opens the link again', async () => {
    const send = vi.fn().mockRejectedValue(Object.assign(new Error('exists'), { name: 'ConditionalCheckFailedException' }));
    const store = createDynamoStore({ send }, 'scribble');
    await expect(
      store.addMembership({ playerSub: 'sub-1', tableId: 't1', role: 'member', joinedAt: '2026-10-09T00:00:00.000Z' }),
    ).resolves.toBeUndefined();
    expect(send.mock.calls[0]![0].input.ConditionExpression).toBe('attribute_not_exists(PK)');
  });

  it('pages through a member’s tables and drops malformed items', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Items: [{ playerSub: 'sub-1', tableId: 't1', role: 'owner', joinedAt: 'a' }, { junk: true }],
        LastEvaluatedKey: { PK: 'WS#MEMBER#sub-1', SK: 'TABLE#t1' },
      })
      .mockResolvedValueOnce({ Items: [{ playerSub: 'sub-1', tableId: 't2', role: 'nope', joinedAt: 'b' }] });
    const store = createDynamoStore({ send }, 'scribble');
    await expect(store.listMemberships('sub-1')).resolves.toEqual([
      { playerSub: 'sub-1', tableId: 't1', role: 'owner', joinedAt: 'a' },
      { playerSub: 'sub-1', tableId: 't2', role: 'member', joinedAt: 'b' },
    ]);
    expect(send.mock.calls[0]![0].input.ExpressionAttributeValues).toEqual({ ':pk': 'WS#MEMBER#sub-1', ':prefix': 'TABLE#' });
    expect(send.mock.calls[1]![0].input.ExclusiveStartKey).toEqual({ PK: 'WS#MEMBER#sub-1', SK: 'TABLE#t1' });
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
    expect(conns).toMatchObject({ IndexName: 'byTable', ExpressionAttributeValues: { ':gsiPk': 'WS#TABLE#t1', ':prefix': 'CONN#' } });
    expect(members).toMatchObject({ IndexName: 'byTable', ExpressionAttributeValues: { ':gsiPk': 'WS#TABLE#t1', ':prefix': 'MEMBER#' } });
    expect(more.ExclusiveStartKey).toEqual({ k: 1 });
  });

  it('reads seats without rack or score, skipping items that are not one of the two seats', async () => {
    const send = vi.fn().mockResolvedValue({
      Items: [
        { seatId: '2', displayName: 'B', seatTokenHash: 'y', avatarId: 4, connectionId: 'c2' },
        { seatId: '1', displayName: 'A', seatTokenHash: 'x', playerSub: 'sub-1', awaySince: '2026-10-08T00:00:00.000Z' },
        { seatId: '3', displayName: 'C', seatTokenHash: 'z' },
      ],
    });
    await expect(createDynamoStore({ send }, 'scribble').listSeats('t1')).resolves.toEqual([
      { seatId: '1', displayName: 'A', avatarId: 1, seatTokenHash: 'x', playerSub: 'sub-1', awaySince: '2026-10-08T00:00:00.000Z' },
      { seatId: '2', displayName: 'B', avatarId: 4, seatTokenHash: 'y', connectionId: 'c2' },
    ]);
    expect(send.mock.calls[0]![0].input.ExpressionAttributeValues).toEqual({ ':pk': 'WS#TABLE#t1', ':prefix': 'SEAT#' });
  });

  it('deletes a table and its seats in one transaction conditioned on the version', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Items: [{ seatId: '1', displayName: 'A', seatTokenHash: 'x' }, { seatId: '2', displayName: 'B', seatTokenHash: 'y' }] })
      .mockResolvedValueOnce({});
    const store = createDynamoStore({ send }, 'scribble');
    await expect(store.deleteTable('t1', 7)).resolves.toBe(true);
    const items = send.mock.calls[1]![0].input.TransactItems;
    expect(items[0].Delete).toMatchObject({
      Key: { PK: 'WS#TABLE#t1', SK: 'META' },
      ConditionExpression: '#version = :expected',
      ExpressionAttributeValues: { ':expected': 7 },
    });
    expect(items.slice(1).map((item: { Delete: { Key: unknown } }) => item.Delete.Key)).toEqual([
      { PK: 'WS#TABLE#t1', SK: 'SEAT#1' },
      { PK: 'WS#TABLE#t1', SK: 'SEAT#2' },
    ]);

    const lost = vi
      .fn()
      .mockResolvedValueOnce({ Items: [] })
      .mockRejectedValueOnce(Object.assign(new Error('cancelled'), { name: 'TransactionCanceledException' }));
    await expect(createDynamoStore({ send: lost }, 'scribble').deleteTable('t1', 7)).resolves.toBe(false);
  });

  it('round-trips a table record, defaulting fields that older or partial items lack', () => {
    expect(parseTableItem({ PK: 'WS#TABLE#t1', SK: 'META', ...TABLE })).toEqual(TABLE);
    const game = { ...beginPlacing(TABLE.game, ['1', '2'], '2'), boards: { '1': { fleet: A_FLEET, ready: true }, '2': { fleet: null, ready: false } } };
    const placing = { ...TABLE, gameNumber: 1, game };
    expect(parseTableItem({ PK: 'WS#TABLE#t1', SK: 'META', ...placing })).toEqual(placing);

    const legacy = parseTableItem({ tableId: 't2', version: 3, game: { status: 'sailing', boards: { '9': {} }, players: ['1', 'x'] } });
    expect(legacy).toMatchObject({ tableId: 't2', version: 3, maxSeats: 2, gameNumber: 0, createdBy: null });
    expect(legacy.game).toMatchObject({ status: 'waiting', boards: {}, players: ['1'], history: [], rematchVotes: [] });
    expect(parseTableItem({ tableId: 't3' }).game.status).toBe('waiting');
  });
});
