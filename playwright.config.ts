import { defineConfig } from '@playwright/test';

// Smoke test against the production build. One-time browser download: npx playwright install chromium
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:4199', viewport: { width: 1920, height: 1080 }, channel: 'chromium' },
  webServer: {
    command: 'node scripts/start.mjs --no-open --port=4199',
    url: 'http://localhost:4199',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
