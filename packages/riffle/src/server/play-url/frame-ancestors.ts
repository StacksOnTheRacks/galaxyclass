import { normalizeFrameAncestors } from '../env.js';

const BLOCKED_TOKENS = new Set(["*", "'*'", "'none'", 'none']);

export function sharedPlayFrameAncestors(raw: string): string {
  const normalized = normalizeFrameAncestors(raw);
  const tokens = normalized.split(/\s+/).filter((token) => token.length > 0);
  const result: string[] = ["'self'"];
  const seen = new Set<string>(["'self'"]);

  for (const token of tokens) {
    if (BLOCKED_TOKENS.has(token)) {
      continue;
    }
    if (!seen.has(token)) {
      seen.add(token);
      result.push(token);
    }
  }

  return result.join(' ');
}

export function embedAncestorOrigins(raw: string): string[] {
  return sharedPlayFrameAncestors(raw)
    .split(/\s+/)
    .filter((token) => token.startsWith('https://'));
}
