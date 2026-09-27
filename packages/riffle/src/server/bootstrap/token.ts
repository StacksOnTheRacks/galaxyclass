import { randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

export function mintOpaqueToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function mintJti(): string {
  return randomBytes(16).toString('base64url');
}

export const BOOTSTRAP_TTL_SECONDS = 60;

export function bootstrapExpiresAt(nowMs: number = Date.now()): number {
  return nowMs + BOOTSTRAP_TTL_SECONDS * 1000;
}

export function isExpired(expiresAtMs: number, nowMs: number = Date.now()): boolean {
  return nowMs >= expiresAtMs;
}

export function buildPlayUrl(publicOrigin: string, token: string): string {
  const encoded = encodeURIComponent(token);
  return `${publicOrigin}/play#bt=${encoded}`;
}
