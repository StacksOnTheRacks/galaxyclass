import { randomUUID } from 'node:crypto';
import type { VerifiedPlayer } from '@galaxyclass/accounts/player-verifier';
import type { ErrorCode, TableSummary } from '../protocol.js';
import { MAX_LISTED_TABLES, MAX_OWNED_TABLES, MAX_TABLE_NAME_LENGTH } from '../rules/constants.js';
import type { WhodunitStore } from './store.js';
import { newTableRecord } from './table-record.js';
import type { MembershipRecord, SeatRecord, TableRecord } from './types.js';

export { MAX_LISTED_TABLES, MAX_OWNED_TABLES, MAX_TABLE_NAME_LENGTH };

export type TableManagerResult<T> = { ok: true; value: T } | { ok: false; code: ErrorCode };

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
  return player.gamerTag ? `${player.gamerTag}'s table` : 'Whodunit? table';
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
      suspect: table.game.picks[seat.seatId]?.suspect ?? null,
    })),
    createdAt: table.createdAt,
    joinedAt: membership.joinedAt,
  };
}

export async function createMemberTable(
  store: WhodunitStore,
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
    createdBy: player.sub,
  });
  const owner: MembershipRecord = { playerSub: player.sub, tableId: table.tableId, role: 'owner', joinedAt: createdAt };
  await store.createTable(table, owner);
  return { ok: true, value: summarizeTable(table, [], owner, player.sub) };
}

/** Opening a table's link while signed in puts it on the member's list. */
export async function joinAsMember(store: WhodunitStore, playerSub: string, table: TableRecord, at: number): Promise<void> {
  await store.addMembership({
    playerSub,
    tableId: table.tableId,
    role: table.createdBy === playerSub ? 'owner' : 'member',
    joinedAt: new Date(at).toISOString(),
  });
}

export async function listMemberTables(store: WhodunitStore, playerSub: string): Promise<TableSummary[]> {
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
 * The host ends a table for everyone: the table and its seats go first (so nobody can sit or act
 * on it), then every member's list entry. Returns the connections that were watching it.
 */
export async function deleteHostedTable(
  store: WhodunitStore,
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
  store: WhodunitStore,
  playerSub: string,
  tableId: unknown,
): Promise<TableManagerResult<string>> {
  if (typeof tableId !== 'string' || tableId === '') {
    return { ok: false, code: 'table_not_found' };
  }
  await store.deleteMembership(playerSub, tableId);
  return { ok: true, value: tableId };
}
