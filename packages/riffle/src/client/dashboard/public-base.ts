/**
 * Path prefix for this SPA build. The root dashboard leaves it empty.
 * The /riffle esbuild build replaces RIFFLE_PUBLIC_BASE with "/riffle".
 * `typeof` keeps vitest (no define) on the root path.
 */
declare const RIFFLE_PUBLIC_BASE: string;

export function publicBase(): string {
  if (typeof RIFFLE_PUBLIC_BASE !== 'string' || RIFFLE_PUBLIC_BASE.length === 0) {
    return '';
  }
  return RIFFLE_PUBLIC_BASE.replace(/\/$/, '');
}
