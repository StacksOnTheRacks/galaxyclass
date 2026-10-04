import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  createSeedTableHandler,
  type SeedGetItemInput,
  type SeedPutItemInput,
  type SeedTableEvent,
  type SeedUpdateItemInput,
} from '../lib/seed-table-handler.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const DEFAULT_STAKES = {
  SmallBlind: 1,
  BigBlind: 2,
  DefaultStack: 2000,
  GroupId: 'the-limp',
  TableLabel: 'The Limp',
};

class ConditionalCheckFailedException extends Error {
  override name = 'ConditionalCheckFailedException';
}

function createFakeDynamo() {
  const items = new Map<string, SeedPutItemInput['Item']>();
  const puts: SeedPutItemInput[] = [];
  const updates: SeedUpdateItemInput[] = [];
  let deletes = 0;

  return {
    items,
    puts,
    updates,
    get deletes() {
      return deletes;
    },
    putItem: async (input: SeedPutItemInput) => {
      puts.push(input);
      const key = `${input.Item.PK!.S}|${input.Item.SK!.S}`;
      if (input.ConditionExpression === 'attribute_not_exists(PK)' && items.has(key)) {
        throw new ConditionalCheckFailedException('The conditional request failed');
      }
      items.set(key, input.Item);
    },
    getItem: async (input: SeedGetItemInput) => {
      const key = `${input.Key.PK!.S}|${input.Key.SK!.S}`;
      return items.get(key);
    },
    updateItem: async (input: SeedUpdateItemInput) => {
      updates.push(input);
      const key = `${input.Key.PK!.S}|${input.Key.SK!.S}`;
      const existing = items.get(key);
      if (!existing) {
        throw new Error('missing item');
      }
      items.set(key, {
        ...existing,
        groupId: input.ExpressionAttributeValues[':groupId']!,
        tableName: input.ExpressionAttributeValues[':tableName']!,
      });
    },
    deleteItem: async () => {
      deletes += 1;
    },
  };
}

function event(
  RequestType: SeedTableEvent['RequestType'],
  PhysicalResourceId?: string,
  stakes: Record<string, unknown> = DEFAULT_STAKES,
): SeedTableEvent {
  return {
    RequestType,
    PhysicalResourceId,
    ResourceProperties: { TableName: 'MatchTable', ...stakes },
  };
}

describe('seed table custom resource handler', () => {
  it('Create mints a UUID v4 and writes the anchor plus its group membership', async () => {
    const dynamo = createFakeDynamo();
    const handler = createSeedTableHandler({
      putItem: dynamo.putItem,
      getItem: dynamo.getItem,
      updateItem: dynamo.updateItem,
      randomTableId: () => randomUUID(),
      now: () => '2026-09-25T12:00:00.000Z',
    });

    const response = await handler(event('Create'));

    assert.match(response.PhysicalResourceId, UUID_V4);
    assert.deepEqual(response.Data, { TableId: response.PhysicalResourceId });
    assert.equal(dynamo.puts.length, 2);

    const [put, membership] = dynamo.puts;
    const tableId = response.PhysicalResourceId;
    assert.equal(put!.TableName, 'MatchTable');
    assert.equal(put!.ConditionExpression, 'attribute_not_exists(PK)');
    assert.deepEqual(put!.Item, {
      PK: { S: `TABLE#${tableId}` },
      SK: { S: 'META' },
      tableId: { S: tableId },
      groupId: { S: 'the-limp' },
      tableName: { S: 'The Limp' },
      version: { N: '1' },
      status: { S: 'open' },
      createdAt: { S: '2026-09-25T12:00:00.000Z' },
      defaultStack: { N: '2000' },
      maxSeats: { N: '8' },
      blinds: { M: { smallBlind: { N: '1' }, bigBlind: { N: '2' } } },
      handNumber: { N: '0' },
      pot: { N: '0' },
      board: { L: [] },
      street: { NULL: true },
      currentSeatId: { NULL: true },
    });
    assert.equal(membership!.Item.PK?.S, 'GROUP#the-limp');
    assert.equal(membership!.Item.SK?.S, `TABLE#2026-09-25T12:00:00.000Z#${tableId}`);
    assert.equal(membership!.Item.anchor?.BOOL, true);
  });

  it('writes the stakes from the custom resource properties', async () => {
    const dynamo = createFakeDynamo();
    const handler = createSeedTableHandler({
      putItem: dynamo.putItem,
      getItem: dynamo.getItem,
      updateItem: dynamo.updateItem,
      randomTableId: () => 'table-stakes',
      now: () => '2026-09-25T12:00:00.000Z',
    });

    await handler(
      event('Create', undefined, {
        ...DEFAULT_STAKES,
        SmallBlind: '25',
        BigBlind: '50',
        DefaultStack: '50000',
        GroupId: 'pocket-rockets',
        TableLabel: 'Pocket Rockets',
      }),
    );

    assert.deepEqual(dynamo.puts[0]!.Item.blinds, {
      M: { smallBlind: { N: '25' }, bigBlind: { N: '50' } },
    });
    assert.deepEqual(dynamo.puts[0]!.Item.defaultStack, { N: '50000' });
    assert.equal(dynamo.puts[0]!.Item.groupId?.S, 'pocket-rockets');
  });

  it('rejects a big blind that does not exceed the small blind', async () => {
    const handler = createSeedTableHandler({
      putItem: async () => {
        throw new Error('should not write');
      },
      getItem: async () => undefined,
      updateItem: async () => {
        throw new Error('should not update');
      },
      randomTableId: () => 'table-invalid',
      now: () => '2026-09-25T12:00:00.000Z',
    });

    await assert.rejects(
      () => handler(event('Create', undefined, { ...DEFAULT_STAKES, SmallBlind: 5, BigBlind: 5, DefaultStack: 5000 })),
      /BigBlind must be greater than SmallBlind/,
    );
  });

  it('rejects a missing group id', async () => {
    const handler = createSeedTableHandler({
      putItem: async () => {
        throw new Error('should not write');
      },
      getItem: async () => undefined,
      updateItem: async () => {
        throw new Error('should not update');
      },
      randomTableId: () => 'table-invalid',
      now: () => '2026-09-25T12:00:00.000Z',
    });

    await assert.rejects(
      () => handler(event('Create', undefined, { ...DEFAULT_STAKES, GroupId: '' })),
      /GroupId must be a slug/,
    );
  });

  it('uses the CSPRNG default id generator in production', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../lib/seed-table-handler.ts', import.meta.url), 'utf8'),
    );
    assert.match(source, /randomTableId: \(\) => randomUUID\(\)/);
    assert.match(source, /import \{ randomUUID \} from 'node:crypto'/);
  });

  it('does not overwrite an existing item for the same PK', async () => {
    const dynamo = createFakeDynamo();
    const fixedId = randomUUID();
    const handler = createSeedTableHandler({
      putItem: dynamo.putItem,
      getItem: dynamo.getItem,
      updateItem: dynamo.updateItem,
      randomTableId: () => fixedId,
      now: () => '2026-09-25T12:00:00.000Z',
    });

    await handler(event('Create'));
    const original = dynamo.items.get(`TABLE#${fixedId}|META`);

    const later = createSeedTableHandler({
      putItem: dynamo.putItem,
      getItem: dynamo.getItem,
      updateItem: dynamo.updateItem,
      randomTableId: () => fixedId,
      now: () => '2027-01-01T00:00:00.000Z',
    });
    await assert.rejects(later(event('Create')), { name: 'ConditionalCheckFailedException' });

    assert.equal(dynamo.items.size, 2);
    assert.deepEqual(dynamo.items.get(`TABLE#${fixedId}|META`), original);
  });

  it('Update keeps the existing id and backfills group fields without a new meta row', async () => {
    const dynamo = createFakeDynamo();
    const created = createSeedTableHandler({
      putItem: dynamo.putItem,
      getItem: dynamo.getItem,
      updateItem: dynamo.updateItem,
      randomTableId: () => 'anchor-id',
      now: () => '2026-01-01T00:00:00.000Z',
    });
    await created(event('Create'));
    dynamo.puts.length = 0;

    const handler = createSeedTableHandler({
      putItem: dynamo.putItem,
      getItem: dynamo.getItem,
      updateItem: dynamo.updateItem,
      randomTableId: () => randomUUID(),
      now: () => '2026-09-25T12:00:00.000Z',
    });

    const response = await handler(
      event('Update', 'anchor-id', { ...DEFAULT_STAKES, GroupId: 'the-button', TableLabel: 'The Button' }),
    );

    assert.deepEqual(response, { PhysicalResourceId: 'anchor-id', Data: { TableId: 'anchor-id' } });
    assert.equal(dynamo.updates.length, 1);
    assert.equal(dynamo.updates[0]?.ExpressionAttributeValues[':groupId']?.S, 'the-button');
    assert.equal(dynamo.updates[0]?.ExpressionAttributeValues[':tableName']?.S, 'The Button');
    assert.equal(dynamo.items.get('TABLE#anchor-id|META')?.groupId?.S, 'the-button');
    assert.equal(dynamo.puts.length, 1);
    assert.equal(dynamo.puts[0]?.Item.PK?.S, 'GROUP#the-button');
    assert.equal(dynamo.puts[0]?.Item.SK?.S, 'TABLE#2026-01-01T00:00:00.000Z#anchor-id');
    assert.equal(dynamo.puts[0]?.Item.anchor?.BOOL, true);
  });

  it('Delete succeeds with zero DeleteItem and zero PutItem', async () => {
    const dynamo = createFakeDynamo();
    const handler = createSeedTableHandler({
      putItem: dynamo.putItem,
      getItem: dynamo.getItem,
      updateItem: dynamo.updateItem,
      randomTableId: () => randomUUID(),
      now: () => '2026-09-25T12:00:00.000Z',
    });

    const existing = randomUUID();
    const response = await handler(event('Delete', existing));

    assert.equal(response.PhysicalResourceId, existing);
    assert.equal(dynamo.puts.length, 0);
    assert.equal(dynamo.deletes, 0);
    assert.equal(dynamo.updates.length, 0);
  });
});
