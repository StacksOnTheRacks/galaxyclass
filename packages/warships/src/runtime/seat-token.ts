import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256 bits of randomness; only its SHA-256 is stored. */
export function mintSeatToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSeatToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifySeatToken(token: unknown, seatTokenHash: string): boolean {
  if (typeof token !== 'string' || !token || !seatTokenHash) {
    return false;
  }
  const candidate = Buffer.from(hashSeatToken(token), 'hex');
  const stored = Buffer.from(seatTokenHash, 'hex');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}
