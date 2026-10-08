/**
 * Warships shares the Scribble DynamoDB table. Every partition key, on the table and on the byTable
 * index, starts with `WS#`, so no Scribble query (`TABLE#…`, `MEMBER#…`, `CONN#…`) can read a Warships
 * item and no Warships query can read a Scribble one. Sort keys mirror Scribble's.
 */
export const KEY_PREFIX = 'WS#';

export const META_SK = 'META';
export const SEAT_SK_PREFIX = 'SEAT#';
export const BY_TABLE_INDEX = 'byTable';

export function tablePk(tableId: string): string {
  return `${KEY_PREFIX}TABLE#${tableId}`;
}

export function seatSk(seatId: string): string {
  return `${SEAT_SK_PREFIX}${seatId}`;
}

export function connPk(connectionId: string): string {
  return `${KEY_PREFIX}CONN#${connectionId}`;
}

export function tableGsiPk(tableId: string): string {
  return `${KEY_PREFIX}TABLE#${tableId}`;
}

export function memberPk(playerSub: string): string {
  return `${KEY_PREFIX}MEMBER#${playerSub}`;
}

export const MEMBERSHIP_SK_PREFIX = 'TABLE#';

export function membershipSk(tableId: string): string {
  return `${MEMBERSHIP_SK_PREFIX}${tableId}`;
}

export const CONN_GSI_SK_PREFIX = 'CONN#';
export const MEMBER_GSI_SK_PREFIX = 'MEMBER#';

export function connGsiSk(connectionId: string): string {
  return `${CONN_GSI_SK_PREFIX}${connectionId}`;
}

/** Memberships sit on the byTable index too, so deleting a table can find every member's list entry. */
export function memberGsiSk(playerSub: string): string {
  return `${MEMBER_GSI_SK_PREFIX}${playerSub}`;
}
