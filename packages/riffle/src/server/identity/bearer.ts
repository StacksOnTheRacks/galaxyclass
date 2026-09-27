import type { RiffleEnv } from '../env.js';

export function parseIdentityBearer(
  authorization: string | undefined,
  env: RiffleEnv,
): string | undefined {
  if (!authorization?.startsWith('Bearer ')) {
    return undefined;
  }
  const token = authorization.slice('Bearer '.length).trim();
  if (!token || token === env.hostApiKey) {
    return undefined;
  }
  if (token.includes('.') && token.split('.').length === 3) {
    return undefined;
  }
  return token;
}
