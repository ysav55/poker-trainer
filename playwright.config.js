// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Poker Trainer — Playwright E2E configuration
 *
 * Starts both the Express server (port 3001) and Vite dev server (port 5173).
 * Tests run against the Vite dev server which proxies API calls to Express.
 */
module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,          // sequential — tests share DB state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,                    // single worker — avoids DB race conditions
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10_000,
  },

  projects: [
    // Auth setup — runs first, produces storageState files
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.js/,
      use: {
        channel: 'chrome',    // use system Chrome, no separate download
      },
    },

    // Main test suite — depends on auth setup
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',    // use system Chrome, no separate download
      },
      dependencies: ['auth-setup'],
    },
  ],

  webServer: [
    {
      command: 'node server/index.js',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        NODE_ENV: 'test',
      },
    },
    {
      command: 'npm run dev --prefix client',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
