import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,  // OAuth flows share a single SQLite-backed server
  retries: 0,            // auth codes are single-use; retrying replays an invalid code
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'rm -f sqlite.db && pnpm dev',
    url: 'http://localhost:8080/',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
