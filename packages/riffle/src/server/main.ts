import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadEnv } from './env.js';
import { attachWsUpgrade } from '../ws/index.js';

const env = loadEnv();
const { app, wsHub, verifyPlayBearer } = createApp({ env });

const server = serve(
  {
    fetch: app.fetch,
    port: env.listenPort,
  },
  (info) => {
    console.log(`riffle-poker listening on http://localhost:${info.port}`);
  },
);

attachWsUpgrade(server, { hub: wsHub, verifyPlayBearer, env });
