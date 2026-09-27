import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) {
    return false;
  }
  return LOOPBACK_ADDRESSES.has(address);
}

export type GetRemoteAddress = (c: Context) => string | undefined;

export function resolveRemoteAddress(
  c: Context,
  getRemoteAddress?: GetRemoteAddress,
): string | undefined {
  if (getRemoteAddress) {
    return getRemoteAddress(c);
  }

  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}
