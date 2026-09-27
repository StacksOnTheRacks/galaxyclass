import { createHash, randomBytes, randomUUID } from 'node:crypto';

export const SEAT_CAPABILITY_TTL_SECONDS = 900;

export interface SeatCapabilityClaims {
  jti: string;
  matchId: string;
  seatId: string;
  playerSubject: string;
  iat: number;
  exp: number;
  purpose: 'seat';
}

const TOKEN_BYTES = 32;
const HEX_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export function mintSeatCapabilityToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

export function mintSeatCapabilityJti(): string {
  return randomUUID();
}

export function hashSeatCapabilityToken(hexString: string): string {
  return createHash('sha256').update(hexString, 'utf8').digest('hex');
}

export function isValidSeatCapabilityTokenFormat(token: string): boolean {
  return HEX_TOKEN_PATTERN.test(token);
}

export function seatCapabilityIssuedAt(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000);
}

export function seatCapabilityExpiresAt(
  iat: number,
  ttlSeconds: number = SEAT_CAPABILITY_TTL_SECONDS,
): number {
  return iat + ttlSeconds;
}

export function isSeatCapabilityExpired(exp: number, nowSeconds: number = Math.floor(Date.now() / 1000)): boolean {
  return nowSeconds >= exp;
}
