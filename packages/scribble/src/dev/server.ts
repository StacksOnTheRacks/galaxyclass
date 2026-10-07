import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { loadDictionary } from '../rules/dictionary.js';
import type { Tile } from '../rules/types.js';
import { createRuntimeHandler } from '../runtime/handler.js';
import { MemoryScribbleStore } from '../runtime/memory-store.js';
import { newTableRecord } from '../runtime/table-record.js';
import type { WebSocketEvent } from '../runtime/types.js';
import { DEV_PROFILES, devPlayerResolver, signDevAccessToken } from './dev-auth.js';

/**
 * Local harness: serves the built SPA at /scribble, runs the real runtime handler over a
 * plain WebSocket with an in-memory store, and signs dev access tokens. Not deployed.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = path.join(root, 'public/scribble');
const avatarsDir = path.resolve(root, '../www/public/avatars');
const fontsDir = path.resolve(root, '../www/public/fonts');
const port = Number(process.env.PORT ?? 5180);

/** Seeded for the WordSmith dev member; QuillDriver reaches them by link like any invitee. */
export const DEV_OWNER = 'dev-word-smith';
export const DEV_TABLES = [
  { id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', name: 'Inkwell' },
  { id: '0f8fad5b-d9cb-469f-a165-70867728950e', name: 'Margins' },
  { id: 'c2b7f5a0-3d1e-4f6a-9b8c-5e4d3c2b1a00', name: 'Scripted practice' },
];
const SCRIPTED_TABLE = DEV_TABLES[2]!.id;
/** Seat 1 can open with CAT across the centre; seat 2 can answer with HEART down onto the T. */
const SCRIPTED_BAG = 'CATDOGS' + 'HEARTSE' + 'EIOUNLRSTA';

const store = new MemoryScribbleStore();
const createdAt = new Date().toISOString();
for (const table of DEV_TABLES) {
  await store.createTable(
    newTableRecord({ tableId: table.id, createdAt, tableName: table.name, visibility: 'private', createdBy: DEV_OWNER }),
    { playerSub: DEV_OWNER, tableId: table.id, role: 'owner', joinedAt: createdAt },
  );
}

function safeNext(value: string | null): string {
  return value && /^\/(?!\/)[A-Za-z0-9\-/._~%]*$/.test(value) ? value : '/scribble';
}

/** Stands in for the studio's /sign-in and /sign-up: pick a dev member and come back. */
function devSignInPage(next: string): string {
  const members = Object.entries(DEV_PROFILES)
    .map(([sub, p]) => `<li><button type="button" data-sub="${sub}">${p.gamerTag}</button></li>`)
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Dev sign in</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:16px system-ui;background:#09080d;color:#f6f1e7;display:grid;place-items:center;min-height:100vh;margin:0}
main{max-width:22rem}ul{list-style:none;padding:0;display:grid;gap:.5rem}
button{font:inherit;width:100%;min-height:44px;border-radius:8px;border:1px solid #58517a;background:#191623;color:inherit;cursor:pointer}
button:focus-visible{outline:2px solid #34e4ea;outline-offset:3px}</style></head>
<body><main><h1>Dev sign in</h1><p>Local stand-in for Galaxy Class sign-in. Choose a member:</p>
<ul>${members}<li><button type="button" data-sub="">Sign out</button></li></ul></main>
<script>
const next = ${JSON.stringify(next)};
for (const button of document.querySelectorAll('button')) {
  button.addEventListener('click', async () => {
    const sub = button.dataset.sub;
    if (sub) {
      const { accessToken } = await (await fetch('/dev/token?sub=' + encodeURIComponent(sub))).json();
      sessionStorage.setItem('scribble.devAccessToken', accessToken);
    } else {
      sessionStorage.removeItem('scribble.devAccessToken');
    }
    location.assign(next);
  });
}
</script></body></html>`;
}

const sockets = new Map<string, WebSocket>();

const runtime = createRuntimeHandler({
  store,
  dictionary: loadDictionary(),
  resolvePlayer: devPlayerResolver(),
  postToConnection: async (connectionId, message) => {
    const socket = sockets.get(connectionId);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw Object.assign(new Error('gone'), { name: 'GoneException' });
    }
    socket.send(JSON.stringify(message));
  },
  startOptions: (tableId) =>
    tableId === SCRIPTED_TABLE
      ? {
          bag: [...SCRIPTED_BAG].map((letter): Tile => ({ id: randomUUID(), letter })),
          firstSeatId: '1',
        }
      : undefined,
});

// API Gateway runs Lambdas concurrently; the dev harness runs them one at a time.
let queue = Promise.resolve();
function dispatch(routeKey: string, connectionId: string, body?: string): void {
  const event: WebSocketEvent = {
    requestContext: { routeKey, connectionId, domainName: `localhost:${port}`, stage: 'dev' },
    body: body ?? null,
  };
  queue = queue.then(() => runtime(event).then(() => undefined)).catch((error) => console.error('[scribble-dev]', error));
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
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

  if (pathname === '/' ) {
    res.writeHead(302, { location: '/scribble' }).end();
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
  if (pathname === '/scribble/config.json') {
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
  if (pathname === '/scribble' || pathname.startsWith('/scribble/')) {
    const file = inside(publicDir, pathname.slice('/scribble'.length).replace(/^\//, ''));
    if (file) {
      sendFile(res, file);
      return;
    }
    if (!path.extname(pathname)) {
      sendFile(res, path.join(publicDir, 'index.html'));
      return;
    }
  }
  res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 32 * 1024 });
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
  console.warn('[scribble-dev] public/scribble is missing; run `npm run build:client` first.');
}
server.listen(port, () => {
  console.log(`[scribble-dev] http://localhost:${port}/scribble`);
});
