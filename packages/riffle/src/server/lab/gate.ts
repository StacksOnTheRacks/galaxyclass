import type { Context } from 'hono';
import type { RiffleEnv } from '../env.js';
import { isLoopbackAddress, resolveRemoteAddress, type GetRemoteAddress } from './remote-address.js';

export function requireJsonContentType(c: Context): Response | undefined {
  const contentType = c.req.header('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') {
    return Response.json({ error: 'invalid_content_type' }, { status: 400 });
  }
  return undefined;
}

export function requireLabEnabled(env: RiffleEnv): Response | undefined {
  if (!env.labEnabled) {
    return Response.json({ error: 'lab_disabled' }, { status: 403 });
  }
  return undefined;
}

export function requireLoopbackClient(
  c: Context,
  getRemoteAddress?: GetRemoteAddress,
): Response | undefined {
  const address = resolveRemoteAddress(c, getRemoteAddress);
  if (!isLoopbackAddress(address)) {
    return Response.json({ error: 'lab_forbidden' }, { status: 403 });
  }
  return undefined;
}

export function enforceLabGate(
  c: Context,
  env: RiffleEnv,
  getRemoteAddress?: GetRemoteAddress,
): Response | undefined {
  const disabled = requireLabEnabled(env);
  if (disabled) {
    return disabled;
  }

  const forbidden = requireLoopbackClient(c, getRemoteAddress);
  if (forbidden) {
    return forbidden;
  }

  return requireJsonContentType(c);
}
