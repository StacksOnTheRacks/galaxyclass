import { randomUUID } from 'node:crypto';
import type { VerifiedPlayer } from '@galaxyclass/accounts/player-verifier';
import type { ScribbleStore } from './store.js';
import { newTableRecord } from './table-record.js';
import type { MembershipRecord, SeatRecord, TableRecord, TableSummary } from './types.js';

/** Tables a member may own at once. Deleting one frees a slot. */
export const MAX_OWNED_TABLES = 20;
/** Newest first; older memberships stay stored but drop off the list. */
export const MAX_LISTED_TABLES = 50;
export const MAX_TABLE_NAME_LENGTH = 40;

export type TableManagerResult<T> = { ok: true; value: T } | { ok: false; code: string };

/** Collapses whitespace and strips control characters; `null` when nothing printable is left. */
export function sanitizeTableName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const name = Array.from(cleaned).slice(0, MAX_TABLE_NAME_LENGTH).join('').trim();
  return name || null;
}

export function defaultTableName(player: VerifiedPlayer): string {
  return player.gamerTag ? `${player.gamerTag}'s table` : 'Scribble table';
}

export function summarizeTable(
  table: TableRecord,
  seats: SeatRecord[],
  membership: Pick<MembershipRecord, 'role' | 'joinedAt'>,
  playerSub: string,
): TableSummary {
  return {
    tableId: table.tableId,
    tableName: table.tableName ?? null,
    role: membership.role,
    status: table.game.status,
    gameNumber: table.gameNumber,
    maxSeats: table.maxSeats,
    seats: seats.map((seat) => ({
      seatId: seat.seatId,
      displayName: seat.displayName,
      avatarId: seat.avatarId,
      away: !seat.connectionId,
      isYou: seat.playerSub === playerSub,
    })),
    createdAt: table.createdAt,
    joinedAt: membership.joinedAt,
  };
}

export async function createMemberTable(
  store: ScribbleStore,
  player: VerifiedPlayer,
  requestedName: unknown,
  at: number,
  newTableId: () => string = randomUUID,
): Promise<TableManagerResult<TableSummary>> {
  const owned = (await store.listMemberships(player.sub)).filter((m) => m.role === 'owner');
  if (owned.length >= MAX_OWNED_TABLES) {
    return { ok: false, code: 'table_limit' };
  }
  const createdAt = new Date(at).toISOString();
  const table = newTableRecord({
    tableId: newTableId(),
    createdAt,
    tableName: sanitizeTableName(requestedName) ?? defaultTableName(player),
    visibility: 'private',
    createdBy: player.sub,
  });
  const owner: MembershipRecord = { playerSub: player.sub, tableId: table.tableId, role: 'owner', joinedAt: createdAt };
  await store.createTable(table, owner);
  return { ok: true, value: summarizeTable(table, [], owner, player.sub) };
}

/** Opening a table's link while signed in puts it on the member's list. */
export async function joinAsMember(store: ScribbleStore, playerSub: string, table: TableRecord, at: number): Promise<void> {
  await store.addMembership({
    playerSub,
    tableId: table.tableId,
    role: table.createdBy === playerSub ? 'owner' : 'member',
    joinedAt: new Date(at).toISOString(),
  });
}

export async function listMemberTables(store: ScribbleStore, playerSub: string): Promise<TableSummary[]> {
  const memberships = (await store.listMemberships(playerSub))
    .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))
    .slice(0, MAX_LISTED_TABLES);
  const summaries = await Promise.all(
    memberships.map(async (membership) => {
      const table = await store.getTable(membership.tableId);
      if (!table) {
        await store.deleteMembership(playerSub, membership.tableId);
        return null;
      }
      return summarizeTable(table, await store.listSeats(table.tableId), membership, playerSub);
    }),
  );
  return summaries.filter((summary): summary is TableSummary => summary !== null);
}

const MAX_DELETE_ATTEMPTS = 3;

/**
 * The host ends a table for everyone: the table and its seats go first (so nobody can sit or play
 * on it), then every member's list entry. Returns the connections that were watching it.
 */
export async function deleteHostedTable(
  store: ScribbleStore,
  playerSub: string,
  tableId: unknown,
): Promise<TableManagerResult<{ tableId: string; connectionIds: string[] }>> {
  if (typeof tableId !== 'string' || tableId === '') {
    return { ok: false, code: 'table_not_found' };
  }
  let deleted = false;
  for (let attempt = 0; attempt < MAX_DELETE_ATTEMPTS && !deleted; attempt++) {
    const table = await store.getTable(tableId);
    if (!table) {
      return { ok: false, code: 'table_not_found' };
    }
    if (!table.createdBy || table.createdBy !== playerSub) {
      return { ok: false, code: 'not_table_host' };
    }
    deleted = await store.deleteTable(tableId, table.version);
  }
  if (!deleted) {
    return { ok: false, code: 'version_conflict' };
  }
  const members = await store.listTableMembers(tableId);
  await Promise.all(members.map((member) => store.deleteMembership(member, tableId)));
  await store.deleteMembership(playerSub, tableId);
  return { ok: true, value: { tableId, connectionIds: await store.listConnectionsForTable(tableId) } };
}

/** Drops the table from the member's list. The table and any seat they hold are untouched. */
export async function forgetMemberTable(
  store: ScribbleStore,
  playerSub: string,
  tableId: unknown,
): Promise<TableManagerResult<string>> {
  if (typeof tableId !== 'string' || tableId === '') {
    return { ok: false, code: 'table_not_found' };
  }
  await store.deleteMembership(playerSub, tableId);
  return { ok: true, value: tableId };
}
