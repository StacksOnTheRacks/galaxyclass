import { randomBytes } from 'node:crypto';

export function generateOpaqueId(prefix: string): string {
  return `${prefix}${randomBytes(16).toString('base64url')}`;
}

export function generateBearer(): string {
  return randomBytes(32).toString('base64url');
}

export function generateAnonymousJti(): string {
  return randomBytes(16).toString('base64url');
}
