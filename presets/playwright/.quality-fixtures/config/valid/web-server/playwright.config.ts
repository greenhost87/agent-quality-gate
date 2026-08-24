import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.pw.ts',
  use: {
    baseURL: 'http://127.0.0.1:4610',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'bun run visualizer',
    url: 'http://127.0.0.1:4610',
    reuseExistingServer: !process.env.CI,
  },
});
