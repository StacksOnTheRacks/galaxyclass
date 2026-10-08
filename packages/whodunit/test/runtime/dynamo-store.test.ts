import { describe, expect, it, vi } from 'vitest';
import { startGame } from '../../src/rules/game.js';
import { seededRandom } from '../../src/rules/random.js';
import { createDynamoStore } from '../../src/runtime/dynamo-store.js';
import { newTableRecord, parseTableItem } from '../../src/runtime/table-record.js';

const TABLE = newTableRecord({ tableId: 't1', createdAt: '2026-10-08T00:00:00.000Z', tableName: 'Starfall Manor', createdBy: 'sub-1' });

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
      Item: { PK: 'WD#TABLE#t1', SK: 'META', version: 2 },
      ConditionExpression: '#version = :expected',
      ExpressionAttributeValues: { ':expected': 1 },
    });
    expect(items[1].Put.Item).toEqual({
      PK: 'WD#TABLE#t1',
      SK: 'SEAT#1',
      seatId: '1',
      displayName: 'Admiral',
      avatarId: 3,
      seatTokenHash: 'ab',
    });
    expect(items[2].Delete.Key).toEqual({ PK: 'WD#TABLE#t1', SK: 'SEAT#2' });
    expect(items[3].Update).toMatchObject({ Key: { PK: 'WD#CONN#c1', SK: 'META' }, UpdateExpression: 'SET seatId = :seatId' });
    expect(items[4].Update).toMatchObject({ UpdateExpression: 'REMOVE seatId' });
  });

  it('writes a meta-only change (a roll, a pick, a ready) as a single conditional put', async () => {
    const send = vi.fn().mockResolvedValue({});
    const store = createDynamoStore({ send }, 'scribble');
    await store.commit({ table: { ...TABLE, version: 5 }, expectedVersion: 4, putSeats: [], deleteSeatIds: [], connectionSeats: [] });
    expect(send).toHaveBeenCalledTimes(1);
    expect(commandName(send.mock.calls[0]!)).toBe('PutCommand');
    expect(send.mock.calls[0]![0].input).toMatchObject({
      TableName: 'scribble',
      Item: { PK: 'WD#TABLE#t1', SK: 'META', version: 5 },
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
    expect(items[0].Put).toMatchObject({ Item: { PK: 'WD#TABLE#t1', SK: 'META' }, ConditionExpression: 'attribute_not_exists(PK)' });
    expect(items[1].Put.Item).toEqual({
      PK: 'WD#MEMBER#sub-1',
      SK: 'TABLE#t1',
      GSI1PK: 'WD#TABLE#t1',
      GSI1SK: 'MEMBER#sub-1',
      playerSub: 'sub-1',
      tableId: 't1',
      role: 'owner',
      joinedAt: '2026-10-08T00:00:00.000Z',
    });
  });

  it('binds a connection to a table on the byTable index under WD#', async () => {
    const send = vi.fn().mockResolvedValue({});
    await createDynamoStore({ send }, 'scribble').bindConnectionToTable('c1', 't1', 'sub-1');
    expect(send.mock.calls[0]![0].input).toMatchObject({
      Key: { PK: 'WD#CONN#c1', SK: 'META' },
      ExpressionAttributeValues: { ':tableId': 't1', ':playerSub': 'sub-1', ':gsiPk': 'WD#TABLE#t1', ':gsiSk': 'CONN#c1' },
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
        LastEvaluatedKey: { PK: 'WD#MEMBER#sub-1', SK: 'TABLE#t1' },
      })
      .mockResolvedValueOnce({ Items: [{ playerSub: 'sub-1', tableId: 't2', role: 'nope', joinedAt: 'b' }] });
    const store = createDynamoStore({ send }, 'scribble');
    await expect(store.listMemberships('sub-1')).resolves.toEqual([
      { playerSub: 'sub-1', tableId: 't1', role: 'owner', joinedAt: 'a' },
      { playerSub: 'sub-1', tableId: 't2', role: 'member', joinedAt: 'b' },
    ]);
    expect(send.mock.calls[0]![0].input.ExpressionAttributeValues).toEqual({ ':pk': 'WD#MEMBER#sub-1', ':prefix': 'TABLE#' });
    expect(send.mock.calls[1]![0].input.ExclusiveStartKey).toEqual({ PK: 'WD#MEMBER#sub-1', SK: 'TABLE#t1' });
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
    expect(conns).toMatchObject({ IndexName: 'byTable', ExpressionAttributeValues: { ':gsiPk': 'WD#TABLE#t1', ':prefix': 'CONN#' } });
    expect(members).toMatchObject({ IndexName: 'byTable', ExpressionAttributeValues: { ':gsiPk': 'WD#TABLE#t1', ':prefix': 'MEMBER#' } });
    expect(more.ExclusiveStartKey).toEqual({ k: 1 });
  });

  it('reads seats, skipping items that are not one of the six seats', async () => {
    const send = vi.fn().mockResolvedValue({
      Items: [
        { seatId: '2', displayName: 'B', seatTokenHash: 'y', avatarId: 4, connectionId: 'c2' },
        { seatId: '1', displayName: 'A', seatTokenHash: 'x', playerSub: 'sub-1', awaySince: '2026-10-08T00:00:00.000Z' },
        { seatId: '7', displayName: 'C', seatTokenHash: 'z' },
      ],
    });
    await expect(createDynamoStore({ send }, 'scribble').listSeats('t1')).resolves.toEqual([
      { seatId: '1', displayName: 'A', avatarId: 1, seatTokenHash: 'x', playerSub: 'sub-1', awaySince: '2026-10-08T00:00:00.000Z' },
      { seatId: '2', displayName: 'B', avatarId: 4, seatTokenHash: 'y', connectionId: 'c2' },
    ]);
    expect(send.mock.calls[0]![0].input.ExpressionAttributeValues).toEqual({ ':pk': 'WD#TABLE#t1', ':prefix': 'SEAT#' });
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
      Key: { PK: 'WD#TABLE#t1', SK: 'META' },
      ConditionExpression: '#version = :expected',
      ExpressionAttributeValues: { ':expected': 7 },
    });
    expect(items.slice(1).map((item: { Delete: { Key: unknown } }) => item.Delete.Key)).toEqual([
      { PK: 'WD#TABLE#t1', SK: 'SEAT#1' },
      { PK: 'WD#TABLE#t1', SK: 'SEAT#2' },
    ]);

    const lost = vi
      .fn()
      .mockResolvedValueOnce({ Items: [] })
      .mockRejectedValueOnce(Object.assign(new Error('cancelled'), { name: 'TransactionCanceledException' }));
    await expect(createDynamoStore({ send: lost }, 'scribble').deleteTable('t1', 7)).resolves.toBe(false);
  });

  it('round-trips a table record, defaulting fields that older or partial items lack', () => {
    expect(parseTableItem({ PK: 'WD#TABLE#t1', SK: 'META', ...TABLE })).toEqual(TABLE);
    const picks = {
      '1': { suspect: 'vesper' as const, ready: true },
      '2': { suspect: 'finch' as const, ready: true },
      '3': { suspect: 'rook' as const, ready: true },
    };
    const begun = startGame({ ...TABLE.game, picks }, { seated: ['1', '2', '3'], connected: ['1', '2', '3'] }, seededRandom(4), {
      now: 1,
      gameNumber: 1,
    });
    if (!begun.ok) throw new Error(begun.code);
    const playing = { ...TABLE, gameNumber: 1, game: { ...begun.state, roster: { '1': { displayName: 'A', avatarId: 1, suspect: 'vesper' as const } } } };
    expect(parseTableItem({ PK: 'WD#TABLE#t1', SK: 'META', ...playing })).toEqual(playing);

    const legacy = parseTableItem({
      tableId: 't2',
      version: 3,
      game: { status: 'sailing', picks: { '9': {}, '2': { suspect: 'nobody', ready: 'yes' } }, players: ['1', 'x'], hands: { '1': ['vial', 'ace'] } },
    });
    expect(legacy).toMatchObject({ tableId: 't2', version: 3, maxSeats: 6, gameNumber: 0, createdBy: null });
    expect(legacy.game).toMatchObject({
      status: 'setup',
      picks: { '2': { suspect: null, ready: false } },
      players: ['1'],
      hands: { '1': ['vial'] },
      log: [],
      weapons: null,
      turn: null,
    });
    expect(legacy.game.positions.vesper).toEqual({ kind: 'hall', x: 7, y: 0 });
    expect(parseTableItem({ tableId: 't3' }).game.status).toBe('setup');
  });
});
