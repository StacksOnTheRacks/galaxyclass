import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { assertSingleAmplifyCore } from './assert-single-amplify.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.join(root, 'public/dashboard-riffle');

await mkdir(outdir, { recursive: true });
await rm(path.join(outdir, 'chunks'), { recursive: true, force: true });
const result = await build({
  entryPoints: [path.join(root, 'src/client/dashboard-play.ts')],
  bundle: true,
  outdir,
  // Amplify is only loaded for signed-in players, so it lives in its own chunk.
  splitting: true,
  entryNames: '[name]',
  chunkNames: 'chunks/[name]-[hash]',
  format: 'esm',
  target: 'es2022',
  loader: { '.css': 'css' },
  external: ['/assets/*', '/fonts/*'],
  define: { RIFFLE_PUBLIC_BASE: '"/riffle"' },
  metafile: true,
});
assertSingleAmplifyCore(result.metafile, 'public/dashboard-riffle/dashboard-play.js');

const cssPath = path.join(outdir, 'dashboard-play.css');
const css = (await readFile(cssPath, 'utf8'))
  .replaceAll("url('/assets/", "url('/riffle/assets/")
  .replaceAll('url("/assets/', 'url("/riffle/assets/')
  .replaceAll('url(/assets/', 'url(/riffle/assets/');
if (/url\((['"]?)\/assets\//.test(css) || !css.includes('/riffle/assets/')) {
  throw new Error('riffle stylesheet still has root /assets urls or lost /riffle/assets urls');
}
await writeFile(cssPath, css);

const assetsDir = path.join(outdir, 'assets');
await rm(assetsDir, { recursive: true, force: true });
await cp(path.join(root, 'public/dashboard/assets'), assetsDir, { recursive: true });
