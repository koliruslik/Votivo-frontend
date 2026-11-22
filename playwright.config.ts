import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
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
      command: 'npm run start -- --host 127.0.0.1',
      url: 'http://localhost:4200',
      reuseExistingServer: !process.env['CI'],
      timeout: 60000,
    },
    {
      command: 'node tests/oidc-server.mjs',
      url: 'http://127.0.0.1:18089/realms/test/.well-known/openid-configuration',
      reuseExistingServer: !process.env['CI'],
    },
  ],
});
