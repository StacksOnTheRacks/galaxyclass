import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { createRuntimeHandler } from '../runtime/handler.js';
import { MemoryWarshipsStore } from '../runtime/memory-store.js';
import { newTableRecord } from '../runtime/table-record.js';
import type { WebSocketEvent } from '../runtime/types.js';
import { DEV_PROFILES, devPlayerResolver, signDevAccessToken } from './dev-auth.js';

/**
 * Local harness: serves the built SPA at /warships, runs the real runtime handler over a
 * plain WebSocket with an in-memory store, and signs dev access tokens. Not deployed.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = path.join(root, 'public/warships');
const avatarsDir = path.resolve(root, '../www/public/avatars');
const fontsDir = path.resolve(root, '../www/public/fonts');
const port = Number(process.env.PORT ?? 5182);

/** Seeded for the Admiral dev member; Captain reaches them by link like any invitee. */
export const DEV_OWNER = 'dev-admiral';
export const DEV_TABLES = [
  { id: '3b2f8d1e-6c4a-4e7b-9a10-5d2c7e8f9a01', name: 'Pacific' },
  { id: '8e4a1c2d-7b3f-4d6e-8a9b-0c1d2e3f4a52', name: 'Atlantic' },
  { id: 'a7c9e1f3-2b4d-4f6a-8c0e-1a3b5c7d9e03', name: 'Scripted practice' },
];
const SCRIPTED_TABLE = DEV_TABLES[2]!.id;

const store = new MemoryWarshipsStore();
const createdAt = new Date().toISOString();
for (const table of DEV_TABLES) {
  await store.createTable(
    newTableRecord({ tableId: table.id, createdAt, tableName: table.name, createdBy: DEV_OWNER }),
    { playerSub: DEV_OWNER, tableId: table.id, role: 'owner', joinedAt: createdAt },
  );
}

function safeNext(value: string | null): string {
  return value && /^\/(?!\/)[A-Za-z0-9\-/._~%]*$/.test(value) ? value : '/warships';
}

/** Stands in for the studio's /sign-in and /sign-up: pick a dev member and come back. */
function devSignInPage(next: string): string {
  const members = Object.entries(DEV_PROFILES)
    .map(([sub, p]) => `<li><button type="button" data-sub="${sub}">${p.gamerTag}</button></li>`)
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Dev sign in</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:16px system-ui;background:#06121f;color:#e8f4ff;display:grid;place-items:center;min-height:100vh;margin:0}
main{max-width:22rem}ul{list-style:none;padding:0;display:grid;gap:.5rem}
button{font:inherit;width:100%;min-height:44px;border-radius:8px;border:1px solid #2b5675;background:#0a2642;color:inherit;cursor:pointer}
button:focus-visible{outline:2px solid #48c4ff;outline-offset:3px}</style></head>
<body><main><h1>Dev sign in</h1><p>Local stand-in for Galaxy Class sign-in. Choose a member:</p>
<ul>${members}<li><button type="button" data-sub="">Sign out</button></li></ul></main>
<script>
const next = ${JSON.stringify(next)};
for (const button of document.querySelectorAll('button')) {
  button.addEventListener('click', async () => {
    const sub = button.dataset.sub;
    if (sub) {
      const { accessToken } = await (await fetch('/dev/token?sub=' + encodeURIComponent(sub))).json();
      sessionStorage.setItem('warships.devAccessToken', accessToken);
    } else {
      sessionStorage.removeItem('warships.devAccessToken');
    }
    location.assign(next);
  });
}
</script></body></html>`;
}

/** Shown at /warships until the client has been built into public/warships. */
const PLACEHOLDER = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Warships · Galaxy Class</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:16px system-ui;background:#06121f;color:#e8f4ff;display:grid;place-items:center;min-height:100vh;margin:0}
code{background:#0a2642;padding:.15rem .4rem;border-radius:4px}</style></head>
<body><main><h1>Warships</h1><p>The client is not built yet. Run <code>npm run build:client --workspace=@galaxyclass/warships</code>
and reload. The WebSocket runtime is already listening at <code>/ws</code>.</p></main></body></html>`;

const sockets = new Map<string, WebSocket>();

const runtime = createRuntimeHandler({
  store,
  resolvePlayer: devPlayerResolver(),
  postToConnection: async (connectionId, message) => {
    const socket = sockets.get(connectionId);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw Object.assign(new Error('gone'), { name: 'GoneException' });
    }
    socket.send(JSON.stringify(message));
  },
  startOptions: (tableId) => (tableId === SCRIPTED_TABLE ? { firstSeatId: '1' } : undefined),
});

// API Gateway runs Lambdas concurrently; the dev harness runs them one at a time.
let queue = Promise.resolve();
function dispatch(routeKey: string, connectionId: string, body?: string): void {
  const event: WebSocketEvent = {
    requestContext: { routeKey, connectionId, domainName: `localhost:${port}`, stage: 'dev' },
    body: body ?? null,
  };
  queue = queue.then(() => runtime(event).then(() => undefined)).catch((error) => console.error('[warships-dev]', error));
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
};

function sendFile(res: ServerResponse, file: string): void {
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
}

function inside(dir: string, relative: string): string | null {
  const file = path.resolve(dir, `.${path.sep}${relative}`);
  return file.startsWith(dir + path.sep) && existsSync(file) && statSync(file).isFile() ? file : null;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/') {
    res.writeHead(302, { location: '/warships' }).end();
    return;
  }
  if (pathname === '/dev/token') {
    const token = signDevAccessToken(url.searchParams.get('sub') ?? '');
    res.writeHead(token ? 200 : 404, { 'content-type': 'application/json' }).end(JSON.stringify({ accessToken: token }));
    return;
  }
  if (pathname === '/sign-in' || pathname === '/sign-up') {
    res
      .writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      .end(devSignInPage(safeNext(url.searchParams.get('next'))));
    return;
  }
  if (pathname === '/warships/config.json') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(
      JSON.stringify({ webSocketUrl: `ws://${req.headers.host}/ws`, dev: true }),
    );
    return;
  }
  for (const [prefix, dir] of [
    ['/avatars/', avatarsDir],
    ['/fonts/', fontsDir],
  ] as const) {
    if (pathname.startsWith(prefix)) {
      const file = inside(dir, pathname.slice(prefix.length));
      if (file) {
        sendFile(res, file);
      } else {
        res.writeHead(404).end();
      }
      return;
    }
  }
  if (pathname === '/warships' || pathname.startsWith('/warships/')) {
    const file = inside(publicDir, pathname.slice('/warships'.length).replace(/^\//, ''));
    if (file) {
      sendFile(res, file);
      return;
    }
    if (!path.extname(pathname)) {
      const index = path.join(publicDir, 'index.html');
      if (existsSync(index)) {
        sendFile(res, index);
      } else {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(PLACEHOLDER);
      }
      return;
    }
  }
  res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });
wss.on('connection', (socket) => {
  const connectionId = randomUUID();
  sockets.set(connectionId, socket);
  dispatch('$connect', connectionId);
  socket.on('message', (data) => dispatch('$default', connectionId, data.toString()));
  socket.on('close', () => {
    sockets.delete(connectionId);
    dispatch('$disconnect', connectionId);
  });
});

if (!existsSync(path.join(publicDir, 'index.html'))) {
  console.warn('[warships-dev] public/warships is missing; serving a placeholder. Run `npm run build:client` first.');
}
server.listen(port, () => {
  console.log(`[warships-dev] http://localhost:${port}/warships`);
});
