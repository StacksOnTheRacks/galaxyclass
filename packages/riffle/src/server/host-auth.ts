import type { Context } from 'hono';
import { bootstrapError } from '../shared/errors.js';
import type { RiffleEnv } from './env.js';

export function requireHostAuth(c: Context, env: RiffleEnv): boolean {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return false;
  }
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 && token === env.hostApiKey;
}

export function unauthorizedResponse() {
  return Response.json(
    bootstrapError('unauthorized', 'Missing or invalid host API key'),
    { status: 401 },
  );
}
