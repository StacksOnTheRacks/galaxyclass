export const META_SK = 'META';
export const SEAT_SK_PREFIX = 'SEAT#';
export const BY_TABLE_INDEX = 'byTable';

export function tablePk(tableId: string): string {
  return `TABLE#${tableId}`;
}

export function seatSk(seatId: string): string {
  return `${SEAT_SK_PREFIX}${seatId}`;
}

export function connPk(connectionId: string): string {
  return `CONN#${connectionId}`;
}

export function tableGsiPk(tableId: string): string {
  return `TABLE#${tableId}`;
}

export function connGsiSk(connectionId: string): string {
  return `CONN#${connectionId}`;
}
