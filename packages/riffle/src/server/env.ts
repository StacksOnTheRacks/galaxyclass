import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface RiffleEnv {
  hostApiKey: string;
  publicOrigin: string;
  listenPort: number;
  frameAncestors: string;
  labEnabled: boolean;
}

export function parseLabEnabled(raw: string | undefined): boolean {
  if (raw === undefined) {
    return false;
  }
  const trimmed = raw.trim().toLowerCase();
  return trimmed === '1' || trimmed === 'true';
}

/** Node --env-file strips quotes, so `self` must be re-quoted for CSP. */
export function normalizeFrameAncestors(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => {
      if (token === 'self' || token === "'self'") {
        return "'self'";
      }
      if (token === 'none' || token === "'none'") {
        return "'none'";
      }
      return token;
    })
    .join(' ');
}

let cachedEnv: RiffleEnv | undefined;

export function loadEnv(overrides?: Partial<RiffleEnv>): RiffleEnv {
  if (cachedEnv && !overrides) {
    return cachedEnv;
  }

  const hostApiKey = overrides?.hostApiKey ?? process.env.RIFFLE_HOST_API_KEY ?? '';
  const publicOrigin = overrides?.publicOrigin ?? process.env.RIFFLE_PUBLIC_ORIGIN ?? '';
  const listenPort =
    overrides?.listenPort ??
    Number.parseInt(process.env.RIFFLE_LISTEN_PORT ?? '3000', 10);
  const frameAncestors = normalizeFrameAncestors(
    overrides?.frameAncestors ?? process.env.RIFFLE_FRAME_ANCESTORS ?? "'self'",
  );
  const labEnabled =
    overrides?.labEnabled ??
    parseLabEnabled(process.env.RIFFLE_LAB_ENABLED);

  if (!hostApiKey) {
    throw new Error('RIFFLE_HOST_API_KEY is required');
  }
  if (!publicOrigin) {
    throw new Error('RIFFLE_PUBLIC_ORIGIN is required');
  }
  if (!Number.isFinite(listenPort) || listenPort <= 0) {
    throw new Error('RIFFLE_LISTEN_PORT must be a positive integer');
  }

  const env: RiffleEnv = {
    hostApiKey,
    publicOrigin: publicOrigin.replace(/\/$/, ''),
    listenPort,
    frameAncestors,
    labEnabled,
  };

  if (!overrides) {
    cachedEnv = env;
  }

  return env;
}

export function resetEnvCache(): void {
  cachedEnv = undefined;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(moduleDir, '..', '..');

export function readPlayHtml(): string {
  return readFileSync(join(projectRoot, 'public', 'play.html'), 'utf8');
}

export function readPlayJs(): string {
  return readFileSync(join(projectRoot, 'public', 'play.js'), 'utf8');
}

export function readPlayCss(): string {
  return readFileSync(join(projectRoot, 'public', 'play.css'), 'utf8');
}

export function readLabHtml(): string {
  return readFileSync(join(projectRoot, 'public', 'lab.html'), 'utf8');
}

export function readLabJs(): string {
  return readFileSync(join(projectRoot, 'public', 'lab.js'), 'utf8');
}

export function readLabCss(): string {
  return readFileSync(join(projectRoot, 'public', 'lab.css'), 'utf8');
}

export function readIdentityHtml(): string {
  return readFileSync(join(projectRoot, 'public', 'identity.html'), 'utf8');
}

export function readIdentityJs(): string {
  return readFileSync(join(projectRoot, 'public', 'identity.js'), 'utf8');
}

export function readIdentityCss(): string {
  return readFileSync(join(projectRoot, 'public', 'identity.css'), 'utf8');
}
