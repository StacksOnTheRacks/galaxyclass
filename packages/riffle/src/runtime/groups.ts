import { isSeatAway } from './hand-state.js';
import { AWAY_GRACE_MS } from './reap.js';
import type { GroupTableMembership, MatchStore } from './store.js';
import type { GroupListEntry, SeatRecord, TableRecord } from './types.js';

const GROUP_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isGroupId(value: string): boolean {
  return GROUP_SLUG_RE.test(value) && !UUID_RE.test(value);
}

export interface GroupTableView {
  membership: GroupTableMembership;
  table: TableRecord;
  seats: SeatRecord[];
}

/** A seat still counts as taken unless the player has been away past the grace period. */
export function isSeatHolding(seat: SeatRecord, nowMs: number): boolean {
  if (!seat.displayName) {
    return false;
  }
  if (!isSeatAway(seat)) {
    return true;
  }
  const since = seat.awaySince ? Date.parse(seat.awaySince) : Number.NaN;
  if (Number.isNaN(since)) {
    return false;
  }
  return nowMs - since < AWAY_GRACE_MS;
}

export function holdingSeatCount(seats: SeatRecord[], nowMs: number): number {
  return seats.filter((seat) => isSeatHolding(seat, nowMs)).length;
}

export function namedSeatCount(seats: SeatRecord[]): number {
  return seats.filter((seat) => Boolean(seat.displayName)).length;
}

/**
 * Fullest table that still has a seat, ties broken toward the oldest table
 * (the permanent anchor sorts first). Null when every table is full.
 */
export function pickGroupTable(views: readonly GroupTableView[], nowMs: number): GroupTableView | null {
  const open = views.filter((view) => holdingSeatCount(view.seats, nowMs) < view.table.maxSeats);
  open.sort((left, right) => {
    const fullness = holdingSeatCount(right.seats, nowMs) - holdingSeatCount(left.seats, nowMs);
    if (fullness !== 0) {
      return fullness;
    }
    if (left.membership.createdAt !== right.membership.createdAt) {
      return left.membership.createdAt < right.membership.createdAt ? -1 : 1;
    }
    return left.table.tableId < right.table.tableId ? -1 : 1;
  });
  return open[0] ?? null;
}

export function summarizeGroup(
  groupId: string,
  views: readonly GroupTableView[],
  nowMs: number,
): GroupListEntry {
  const picked = pickGroupTable(views, nowMs);
  return {
    groupId,
    seatedCount: views.reduce((sum, view) => sum + namedSeatCount(view.seats), 0),
    tableCount: views.length,
    nextTableSeated: picked ? holdingSeatCount(picked.seats, nowMs) : 0,
  };
}

export async function loadGroupTables(store: MatchStore, groupId: string): Promise<GroupTableView[]> {
  const memberships = await store.listGroupTables(groupId);
  const views: GroupTableView[] = [];
  for (const membership of memberships) {
    const table = await store.getTable(membership.tableId);
    if (!table) {
      continue;
    }
    views.push({
      membership,
      table,
      seats: await store.listSeats(membership.tableId),
    });
  }
  return views;
}
