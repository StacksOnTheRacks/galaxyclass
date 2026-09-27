export const META_SK = 'META';

export function tablePk(tableId: string): string {
  return `TABLE#${tableId}`;
}

export function connPk(connectionId: string): string {
  return `CONN#${connectionId}`;
}

export function seatSk(seatId: string): string {
  return `SEAT#${seatId}`;
}

export function tableGsiPk(tableId: string): string {
  return `TABLE#${tableId}`;
}

export function connGsiSk(connectionId: string): string {
  return `CONN#${connectionId}`;
}
