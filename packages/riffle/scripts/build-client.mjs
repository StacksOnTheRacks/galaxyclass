import { cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @type {Array<{ entry: string; outfile: string; external?: string[]; define?: Record<string, string>; split?: boolean }>} */
const bundles = [
  { entry: 'src/client/play.ts', outfile: 'public/play.js' },
  { entry: 'src/client/lab.ts', outfile: 'public/lab.js' },
  { entry: 'src/client/identity.ts', outfile: 'public/identity.js' },
  {
    entry: 'src/client/dashboard-play.ts',
    outfile: 'public/dashboard/dashboard-play.js',
    external: ['/assets/*'],
    define: { RIFFLE_PUBLIC_BASE: '""' },
    split: true,
  },
];

for (const bundle of bundles) {
  const outfile = path.join(root, bundle.outfile);
  // Split bundles keep lazily imported modules (Amplify) in chunks/ next to the entry.
  const output = bundle.split
    ? { outdir: path.dirname(outfile), splitting: true, entryNames: '[name]', chunkNames: 'chunks/[name]-[hash]' }
    : { outfile };
  if (bundle.split) {
    await rm(path.join(path.dirname(outfile), 'chunks'), { recursive: true, force: true });
  }
  await build({
    entryPoints: [path.join(root, bundle.entry)],
    bundle: true,
    ...output,
    format: 'esm',
    target: 'es2022',
    loader: { '.css': 'css' },
    external: bundle.external,
    define: bundle.define,
  });
}

await cp(path.join(root, 'src/client/identity.css'), path.join(root, 'public/identity.css'));
await import('./build-dashboard-riffle.mjs');
