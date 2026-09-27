import type { RiffleEnv } from '../env.js';
import { readIdentityCss, readIdentityHtml, readIdentityJs } from '../env.js';

export const IDENTITY_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

function identityPageResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': IDENTITY_CSP,
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    },
  });
}

function renderIdentityShell(): string {
  return readIdentityHtml().replace(
    '<!-- RIFFLE_IDENTITY_CLIENT -->',
    `<script type="module" src="/identity.js"></script>`,
  );
}

export function createIdentityPageHandler(_env: RiffleEnv) {
  return () => identityPageResponse(renderIdentityShell());
}

export function createIdentityJsHandler() {
  return () =>
    new Response(readIdentityJs(), {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
}

export function createIdentityCssHandler() {
  return () =>
    new Response(readIdentityCss(), {
      status: 200,
      headers: {
        'Content-Type': 'text/css; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
}
