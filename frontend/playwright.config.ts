import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  webServer: {
    command: 'npm run dev',
    cwd: '..',
    reuseExistingServer: false,
    port: 5173,
    timeout: 120_000,
  },
  use: {
    baseURL: 'http://localhost:5173',
  },
});
