import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.join(root, 'public/dashboard-riffle');

await mkdir(outdir, { recursive: true });
await build({
  entryPoints: [path.join(root, 'src/client/dashboard-play.ts')],
  bundle: true,
  outfile: path.join(outdir, 'dashboard-play.js'),
  format: 'esm',
  target: 'es2022',
  loader: { '.css': 'css' },
  external: ['/assets/*'],
  define: { RIFFLE_PUBLIC_BASE: '"/riffle"' },
});

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
