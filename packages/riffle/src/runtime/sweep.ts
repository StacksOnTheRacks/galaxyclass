import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { isSeatHolding, loadGroupTables, type GroupTableView } from './groups.js';
import { createMatchStore, type MatchStore } from './store.js';

/** Don't delete a table a player may still be walking into. */
export const SWEEP_MIN_AGE_MS = 15 * 60 * 1000;

export function isPrunableOverflow(
  view: GroupTableView,
  nowMs: number,
  connectionCount: number,
  minAgeMs: number = SWEEP_MIN_AGE_MS,
): boolean {
  if (view.membership.anchor) {
    return false;
  }
  if (connectionCount > 0) {
    return false;
  }
  const createdMs = Date.parse(view.membership.createdAt);
  if (Number.isNaN(createdMs) || nowMs - createdMs < minAgeMs) {
    return false;
  }
  return !view.seats.some((seat) => isSeatHolding(seat, nowMs));
}

export async function sweepGroups(deps: {
  store: MatchStore;
  now: string;
  groupIds: readonly string[];
  minAgeMs?: number;
  connectionCount?: (tableId: string) => Promise<number>;
}): Promise<string[]> {
  const nowMs = Date.parse(deps.now);
  const deleted: string[] = [];
  const connections =
    deps.connectionCount ?? ((tableId: string) => deps.store.listConnectionsForTable(tableId).then((rows) => rows.length));

  for (const groupId of deps.groupIds) {
    const views = await loadGroupTables(deps.store, groupId);
    for (const view of views) {
      const connectionCount = await connections(view.table.tableId);
      if (!isPrunableOverflow(view, nowMs, connectionCount, deps.minAgeMs)) {
        continue;
      }
      await deps.store.deleteTable(view.table.tableId, groupId, view.membership.membershipSk);
      deleted.push(view.table.tableId);
    }
  }

  return deleted;
}

function readGroupIds(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export async function handler(): Promise<{ deleted: string[] }> {
  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error('TABLE_NAME is required');
  }

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  const store = createMatchStore(client, { tableName });
  const deleted = await sweepGroups({
    store,
    now: new Date().toISOString(),
    groupIds: readGroupIds(process.env.GROUP_IDS),
  });
  return { deleted };
}
