import { Hono } from 'hono';
import type { MatchStore } from '../../match-store/index.js';
import type { RiffleEnv } from '../env.js';
import { readPlayHtml } from '../env.js';
import { embedAncestorOrigins, sharedPlayFrameAncestors } from './frame-ancestors.js';

export interface PlayUrlStores {
  matchStore: MatchStore;
}

function buildSharedPlayHtml(env: RiffleEnv): string {
  const origins = embedAncestorOrigins(env.frameAncestors);
  const meta =
    origins.length > 0
      ? `<meta name="riffle-embed-ancestors" content="${origins.join(' ')}" />`
      : '';

  return readPlayHtml()
    .replace('<title>Riffle Poker — Play</title>', '<title>Riffle Poker table</title>')
    .replace('</head>', `${meta}\n</head>`)
    .replace('<!-- RIFFLE_CLIENT -->', `<script type="module" src="/play.js"></script>`);
}

function sharedPlayCsp(env: RiffleEnv): string {
  return `frame-ancestors ${sharedPlayFrameAncestors(env.frameAncestors)}; default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'`;
}

export function createPlayUrlPageHandler(env: RiffleEnv) {
  const html = buildSharedPlayHtml(env);
  const csp = sharedPlayCsp(env);

  return (c: {
    html: (body: string, status?: number, headers?: Record<string, string>) => Response;
  }) => {
    return c.html(html, 200, {
      'Content-Security-Policy': csp,
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    });
  };
}

export function createPlayUrlLookupRoutes(stores: PlayUrlStores) {
  const routes = new Hono();

  routes.get('/matches/:matchId', (c) => {
    const matchId = c.req.param('matchId')?.trim() ?? '';
    if (!matchId) {
      return c.json({ error: 'match_not_found' }, 404);
    }

    const result = stores.matchStore.getPublicState(matchId);
    if (!result.ok) {
      return c.json({ error: 'match_not_found' }, 404);
    }

    return c.json({ matchId: result.value.matchId }, 200, {
      'Cache-Control': 'no-store',
    });
  });

  return routes;
}

export { sharedPlayCsp };
