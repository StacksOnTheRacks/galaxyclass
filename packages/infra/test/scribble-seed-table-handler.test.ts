import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTableItem } from '@galaxyclass/scribble/table-record';
import { createScribbleSeedHandler, type ScribbleSeedDeps } from '../lib/scribble-seed-table-handler.js';

function fakeDeps() {
  const puts: Array<{ tableName: string; item: Record<string, unknown> }> = [];
  const renames: Array<{ tableName: string; tableId: string; label: string }> = [];
  const deps: ScribbleSeedDeps = {
    async putNew(tableName, item) {
      puts.push({ tableName, item });
    },
    async rename(tableName, tableId, label) {
      renames.push({ tableName, tableId, label });
    },
    randomTableId: () => '2f1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    now: () => '2026-10-04T12:00:00.000Z',
  };
  return { deps, puts, renames };
}

test('Create writes a waiting, public, listed table the runtime can read', async () => {
  const { deps, puts } = fakeDeps();
  const result = await createScribbleSeedHandler(deps)({
    RequestType: 'Create',
    ResourceProperties: { TableName: 'scribble-table', TableLabel: 'Inkwell' },
  });
  assert.deepEqual(result, {
    PhysicalResourceId: '2f1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    Data: { TableId: '2f1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d' },
  });
  assert.equal(puts.length, 1);
  const { tableName, item } = puts[0]!;
  assert.equal(tableName, 'scribble-table');
  assert.equal(item.PK, 'TABLE#2f1b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d');
  assert.equal(item.SK, 'META');
  const record = parseTableItem(item);
  assert.equal(record.tableName, 'Inkwell');
  assert.equal(record.visibility, 'public');
  assert.equal(record.listed, true);
  assert.equal(record.createdBy, null);
  assert.equal(record.maxSeats, 4);
  assert.equal(record.themeId, 'default');
  assert.equal(record.game.status, 'waiting');
  assert.deepEqual(record.game.bag, []);
});

test('Update renames the existing table and never remints its id', async () => {
  const { deps, puts, renames } = fakeDeps();
  const result = await createScribbleSeedHandler(deps)({
    RequestType: 'Update',
    PhysicalResourceId: 'existing-id',
    ResourceProperties: { TableName: 'scribble-table', TableLabel: 'Margins' },
  });
  assert.deepEqual(result, { PhysicalResourceId: 'existing-id', Data: { TableId: 'existing-id' } });
  assert.equal(puts.length, 0);
  assert.deepEqual(renames, [{ tableName: 'scribble-table', tableId: 'existing-id', label: 'Margins' }]);
});

test('Delete leaves the table in place', async () => {
  const { deps, puts, renames } = fakeDeps();
  const result = await createScribbleSeedHandler(deps)({
    RequestType: 'Delete',
    PhysicalResourceId: 'existing-id',
    ResourceProperties: {},
  });
  assert.deepEqual(result, { PhysicalResourceId: 'existing-id' });
  assert.equal(puts.length + renames.length, 0);
});

test('Create without a label or table name fails', async () => {
  const { deps } = fakeDeps();
  const onEvent = createScribbleSeedHandler(deps);
  await assert.rejects(
    onEvent({ RequestType: 'Create', ResourceProperties: { TableName: 'scribble-table' } }),
    /TableLabel is required/,
  );
  await assert.rejects(onEvent({ RequestType: 'Create', ResourceProperties: { TableLabel: 'Inkwell' } }), /TableName/);
});
