import { createHash, randomUUID } from 'node:crypto';

export function mintSeatToken(): string {
  return randomUUID();
}

export function hashSeatToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifySeatToken(token: string, seatTokenHash: string): boolean {
  if (!token || !seatTokenHash) {
    return false;
  }
  const candidate = hashSeatToken(token);
  return candidate === seatTokenHash;
}
