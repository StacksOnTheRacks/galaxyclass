import { defineConfig } from '@playwright/test';

const port = Number(process.env.SCRIBBLE_E2E_PORT ?? 5181);

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1280, height: 860 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx tsx src/dev/server.ts',
    url: `http://localhost:${port}/scribble`,
    env: { PORT: String(port) },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
