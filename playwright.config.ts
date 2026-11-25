import { defineConfig, devices } from '@playwright/test';
const port = process.env['E2E_PORT'] ?? '4200';
const oidcPort = process.env['E2E_OIDC_PORT'] ?? '18089';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://localhost:${port}`,
    channel: process.env['CI'] ? undefined : 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    {
      command: `npm run start -- --host 127.0.0.1 --port ${port}`,
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: !process.env['CI'],
      timeout: 60000,
    },
    {
      command: 'node tests/oidc-server.mjs',
      env: { E2E_OIDC_PORT: oidcPort, E2E_APP_ORIGIN: `http://localhost:${port}` },
      url: `http://127.0.0.1:${oidcPort}/realms/test/.well-known/openid-configuration`,
      reuseExistingServer: !process.env['CI'],
    },
  ],
});
