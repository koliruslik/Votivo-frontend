import { test, expect } from '@playwright/test';

test('production headers permit silent SSO, session restoration and logout', async ({ page }) => {
  await page.route('**/auth-config.json', (route) =>
    route.fulfill({
      json: {
        enabled: true,
        url: 'http://localhost:18089',
        realm: 'test',
        clientId: 'votivo-frontend',
        registrationEnabled: true,
        dpopMode: 'strict',
      },
    }),
  );
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({ json: { content: [], page: 0, totalElements: 0, totalPages: 0 } }),
  );
  const callback = page.waitForResponse((response) =>
    response.url().includes('/silent-check-sso.html'),
  );
  const main = await page.goto('/polls');
  expect(main!.headers()['x-frame-options']).toBe('DENY');
  expect((await callback).headers()['x-frame-options']).toBe('SAMEORIGIN');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Continue as test user' }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
});
