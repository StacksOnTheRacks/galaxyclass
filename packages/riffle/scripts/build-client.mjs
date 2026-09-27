import { cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @type {Array<{ entry: string; outfile: string; external?: string[]; define?: Record<string, string> }>} */
const bundles = [
  { entry: 'src/client/play.ts', outfile: 'public/play.js' },
  { entry: 'src/client/lab.ts', outfile: 'public/lab.js' },
  { entry: 'src/client/identity.ts', outfile: 'public/identity.js' },
  {
    entry: 'src/client/dashboard-play.ts',
    outfile: 'public/dashboard/dashboard-play.js',
    external: ['/assets/*'],
    define: { RIFFLE_PUBLIC_BASE: '""' },
  },
];

for (const bundle of bundles) {
  await build({
    entryPoints: [path.join(root, bundle.entry)],
    bundle: true,
    outfile: path.join(root, bundle.outfile),
    format: 'esm',
    target: 'es2022',
    loader: { '.css': 'css' },
    external: bundle.external,
    define: bundle.define,
  });
}

await cp(path.join(root, 'src/client/identity.css'), path.join(root, 'public/identity.css'));
await import('./build-dashboard-riffle.mjs');
