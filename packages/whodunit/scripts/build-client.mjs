import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.join(root, 'public/whodunit');

/**
 * Amplify keeps its configuration on a module-level singleton in @aws-amplify/core. Two
 * bundled copies would let configure and fetchAuthSession disagree, and signed-in members
 * would silently look signed out.
 */
function assertSingleAmplifyCore(metafile) {
  const roots = new Set();
  for (const input of Object.keys(metafile.inputs)) {
    const match = input.match(/^(.*node_modules\/@aws-amplify\/core)\//);
    if (match) {
      roots.add(match[1]);
    }
  }
  if (roots.size > 1) {
    throw new Error(`whodunit bundles ${roots.size} copies of @aws-amplify/core: ${[...roots].join(', ')}`);
  }
}

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const result = await build({
  entryPoints: [path.join(root, 'src/client/main.ts')],
  bundle: true,
  outdir,
  splitting: true,
  entryNames: '[name]',
  chunkNames: 'chunks/[name]-[hash]',
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  minify: process.env.WHODUNIT_MINIFY !== '0',
  sourcemap: false,
  loader: { '.css': 'css' },
  external: ['/whodunit/*', '/avatars/*', '/fonts/*'],
  define: { WHODUNIT_PUBLIC_BASE: '"/whodunit"' },
  metafile: true,
  logLevel: 'warning',
});
assertSingleAmplifyCore(result.metafile);

await cp(path.join(root, 'src/client/index.html'), path.join(outdir, 'index.html'));
await cp(path.join(root, 'assets'), path.join(outdir, 'assets'), { recursive: true });
