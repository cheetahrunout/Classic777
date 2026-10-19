import { defineConfig, devices } from '@playwright/test';

// Smoke tests against the built app (pnpm run build) and a stub casino, never the real one.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:8080',
    ...devices['Desktop Chrome'],
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'node e2e/stub-casino.mjs 9911',
      url: 'http://127.0.0.1:9911/api/game/control',
      reuseExistingServer: false,
      env: { GAME_KEY: 'stub-key' },
    },
    {
      command: 'node apps/server/dist/server.cjs',
      url: 'http://127.0.0.1:8080/health',
      reuseExistingServer: false,
      env: { PORT: '8080', CASINO_URL: 'http://127.0.0.1:9911', CASINO_PUBLIC_URL: 'http://127.0.0.1:9911', GAME_KEY: 'stub-key', GAME_VERSION: 'e2e' },
    },
  ],
});
