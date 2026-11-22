import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/production',
  workers: 1,
  use: {
    baseURL: 'http://localhost:4200',
    channel: process.env['CI'] ? undefined : 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: [
    {
      command: 'node server/index.mjs',
      env: { PORT: '4200', PUBLIC_ORIGIN: 'http://localhost:4200', INTERNAL_AUTH_SECRET: 'e2e-secret' },
      url: 'http://localhost:4200/health',
      reuseExistingServer: false,
    },
    {
      command: 'node tests/oidc-server.mjs',
      url: 'http://127.0.0.1:18089/realms/test/.well-known/openid-configuration',
      reuseExistingServer: false,
    },
  ],
});
