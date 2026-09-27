import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  createSeedTableHandler,
  type SeedPutItemInput,
  type SeedTableEvent,
} from '../lib/seed-table-handler.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

class ConditionalCheckFailedException extends Error {
  override name = 'ConditionalCheckFailedException';
}

function createFakeDynamo() {
  const items = new Map<string, SeedPutItemInput['Item']>();
  const puts: SeedPutItemInput[] = [];
  let deletes = 0;

  return {
    items,
    puts,
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
    deleteItem: async () => {
      deletes += 1;
    },
  };
}

function event(
  RequestType: SeedTableEvent['RequestType'],
  PhysicalResourceId?: string,
): SeedTableEvent {
  return {
    RequestType,
    PhysicalResourceId,
    ResourceProperties: { TableName: 'MatchTable' },
  };
}

describe('seed table custom resource handler', () => {
  it('Create mints a UUID v4 and issues one conditional PutItem matching createTable', async () => {
    const dynamo = createFakeDynamo();
    const handler = createSeedTableHandler({
      putItem: dynamo.putItem,
      randomTableId: () => randomUUID(),
      now: () => '2026-09-25T12:00:00.000Z',
    });

    const response = await handler(event('Create'));

    assert.match(response.PhysicalResourceId, UUID_V4);
    assert.deepEqual(response.Data, { TableId: response.PhysicalResourceId });
    assert.equal(dynamo.puts.length, 1);

    const [put] = dynamo.puts;
    const tableId = response.PhysicalResourceId;
    assert.equal(put!.TableName, 'MatchTable');
    assert.equal(put!.ConditionExpression, 'attribute_not_exists(PK)');
    assert.deepEqual(put!.Item, {
      PK: { S: `TABLE#${tableId}` },
      SK: { S: 'META' },
      tableId: { S: tableId },
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
      randomTableId: () => fixedId,
      now: () => '2026-09-25T12:00:00.000Z',
    });

    await handler(event('Create'));
    const original = dynamo.items.get(`TABLE#${fixedId}|META`);

    const later = createSeedTableHandler({
      putItem: dynamo.putItem,
      randomTableId: () => fixedId,
      now: () => '2027-01-01T00:00:00.000Z',
    });
    await assert.rejects(later(event('Create')), { name: 'ConditionalCheckFailedException' });

    assert.equal(dynamo.items.size, 1);
    assert.deepEqual(dynamo.items.get(`TABLE#${fixedId}|META`), original);
  });

  it('Update keeps the existing id and performs zero PutItem', async () => {
    const dynamo = createFakeDynamo();
    const handler = createSeedTableHandler({
      putItem: dynamo.putItem,
      randomTableId: () => randomUUID(),
      now: () => '2026-09-25T12:00:00.000Z',
    });

    const existing = randomUUID();
    const response = await handler(event('Update', existing));

    assert.deepEqual(response, { PhysicalResourceId: existing, Data: { TableId: existing } });
    assert.equal(dynamo.puts.length, 0);
  });

  it('Delete succeeds with zero DeleteItem and zero PutItem', async () => {
    const dynamo = createFakeDynamo();
    const handler = createSeedTableHandler({
      putItem: dynamo.putItem,
      randomTableId: () => randomUUID(),
      now: () => '2026-09-25T12:00:00.000Z',
    });

    const existing = randomUUID();
    const response = await handler(event('Delete', existing));

    assert.equal(response.PhysicalResourceId, existing);
    assert.equal(dynamo.puts.length, 0);
    assert.equal(dynamo.deletes, 0);
  });
});
