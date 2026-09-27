import type { RiffleEnv } from '../env.js';
import { readLabCss, readLabHtml, readLabJs } from '../env.js';

const LAB_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

export function createLabPageHandler(_env: RiffleEnv) {
  return (c: { html: (body: string, status?: number, headers?: Record<string, string>) => Response }) => {
    const html = readLabHtml().replace(
      '<!-- RIFFLE_LAB_CLIENT -->',
      `<script type="module" src="/lab.js"></script>`,
    );

    return c.html(html, 200, {
      'Content-Security-Policy': LAB_CSP,
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    });
  };
}

export function createLabJsHandler() {
  return () => {
    const js = readLabJs();
    return new Response(js, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  };
}

export function createLabCssHandler() {
  return () => {
    const css = readLabCss();
    return new Response(css, {
      status: 200,
      headers: {
        'Content-Type': 'text/css; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  };
}

export { LAB_CSP };
