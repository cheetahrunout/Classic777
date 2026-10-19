import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: 'node apps/server/src/server.js',
    port: 8080,
    reuseExistingServer: true,
    env: { GAME_KEY: 'stub', CASINO_URL: 'http://127.0.0.1:9999' },
  },
});
