import { Hono } from 'hono';
import { bootstrapError } from '../../shared/errors.js';
import type { RiffleEnv } from '../env.js';
import { normalizeFrameAncestors, readPlayCss, readPlayHtml, readPlayJs } from '../env.js';
import { requireHostAuth, unauthorizedResponse } from '../host-auth.js';
import { BootstrapLedger } from './ledger.js';
import { PlaySessionStore } from './play-session.js';
import {
  buildPlaySessionCookie,
  parsePlaySessionCookie,
} from './cookie.js';
import { mintBootstrap } from './mint.js';
import { isExpired } from './token.js';

export interface BootstrapStores {
  bootstrapLedger: BootstrapLedger;
  playSessionStore: PlaySessionStore;
}

export function createBootstrapRoutes(env: RiffleEnv, stores: BootstrapStores) {
  const routes = new Hono();

  routes.post('/mint', async (c) => {
    if (!requireHostAuth(c, env)) {
      return unauthorizedResponse();
    }

    let body: { matchId?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return Response.json(
        bootstrapError('invalid_match_id', 'Request body must be JSON with matchId'),
        { status: 400 },
      );
    }

    const matchId = typeof body.matchId === 'string' ? body.matchId.trim() : '';
    if (!matchId || matchId.length > 128) {
      return Response.json(
        bootstrapError('invalid_match_id', 'matchId must be 1–128 characters'),
        { status: 400 },
      );
    }

    const minted = mintBootstrap(env, stores.bootstrapLedger, { matchId });

    return Response.json({
      token: minted.token,
      playUrl: minted.playUrl,
      expiresIn: minted.expiresIn,
      jti: minted.jti,
    });
  });

  routes.post('/redeem', async (c) => {
    let body: { token?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return Response.json(
        bootstrapError('missing_token', 'Request body must be JSON with token'),
        { status: 403 },
      );
    }

    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) {
      return Response.json(
        bootstrapError('missing_token', 'Bootstrap token is required'),
        { status: 403 },
      );
    }

    const entry = stores.bootstrapLedger.get(token);
    if (!entry) {
      return Response.json(
        bootstrapError('invalid_token', 'Bootstrap token is not recognized'),
        { status: 403 },
      );
    }

    if (entry.used) {
      return Response.json(
        bootstrapError('already_used', 'Bootstrap token has already been redeemed'),
        { status: 403 },
      );
    }

    if (isExpired(entry.expiresAt)) {
      return Response.json(
        bootstrapError('expired_token', 'Bootstrap token has expired'),
        { status: 403 },
      );
    }

    stores.bootstrapLedger.markUsed(token);
    const sessionId = stores.playSessionStore.create(entry.matchId);

    return Response.json(
      { matchId: entry.matchId, bound: true as const },
      {
        status: 200,
        headers: {
          'Set-Cookie': buildPlaySessionCookie(sessionId),
        },
      },
    );
  });

  routes.get('/session', (c) => {
    const sessionId = parsePlaySessionCookie(c.req.header('Cookie'));
    if (!sessionId) {
      return Response.json(
        bootstrapError('invalid_session', 'Play session cookie is missing or invalid'),
        { status: 403 },
      );
    }

    const session = stores.playSessionStore.get(sessionId);
    if (!session) {
      return Response.json(
        bootstrapError('invalid_session', 'Play session cookie is missing or invalid'),
        { status: 403 },
      );
    }

    return Response.json({ matchId: session.matchId, bound: true as const });
  });

  return routes;
}

export function createPlayPageHandler(env: RiffleEnv) {
  return (c: { html: (body: string, status?: number, headers?: Record<string, string>) => Response }) => {
    const html = readPlayHtml().replace(
      '<!-- RIFFLE_CLIENT -->',
      `<script type="module" src="/play.js"></script>`,
    );

    const csp = `frame-ancestors ${normalizeFrameAncestors(env.frameAncestors)}; default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'`;

    return c.html(html, 200, {
      'Content-Security-Policy': csp,
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    });
  };
}

export function createPlayJsHandler() {
  return () => {
    const js = readPlayJs();
    return new Response(js, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  };
}

export function createPlayCssHandler() {
  return () => {
    const css = readPlayCss();
    return new Response(css, {
      status: 200,
      headers: {
        'Content-Type': 'text/css; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  };
}

export function createBootstrapStores(): BootstrapStores {
  return {
    bootstrapLedger: new BootstrapLedger(),
    playSessionStore: new PlaySessionStore(),
  };
}
