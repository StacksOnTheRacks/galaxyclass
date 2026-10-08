import { defineConfig } from '@playwright/test';

const port = Number(process.env.WHODUNIT_E2E_PORT ?? 5185);

export default defineConfig({
  testDir: 'e2e',
  // Three detectives play a whole case, and the server holds each action until its animation has played.
  timeout: 240_000,
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
    url: `http://localhost:${port}/whodunit`,
    env: { PORT: String(port) },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
