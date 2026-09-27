import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [path.join(root, 'src/server/main.ts')],
  bundle: true,
  outfile: path.join(root, 'dist/server/main.js'),
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
});
