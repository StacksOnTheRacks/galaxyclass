import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;

export function isValidPassword(password: string): boolean {
  return password.length >= 8 && password.length <= 128;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const derived = (await scryptAsync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })) as Buffer;
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }
  const n = Number.parseInt(parts[1] ?? '', 10);
  const r = Number.parseInt(parts[2] ?? '', 10);
  const p = Number.parseInt(parts[3] ?? '', 10);
  const saltB64 = parts[4];
  const hashB64 = parts[5];
  if (!saltB64 || !hashB64 || !Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }

  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(hashB64, 'base64url');
  const derived = (await scryptAsync(password, salt, expected.length, {
    N: n,
    r,
    p,
  })) as Buffer;

  if (derived.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(derived, expected);
}
