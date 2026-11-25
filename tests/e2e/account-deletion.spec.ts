import { test, expect, Page } from '@playwright/test';

async function setup(page: Page) {
  const state = { status: 409, requests: 0 };
  await page.route('**/auth-config.json', (route) =>
    route.fulfill({
      json: {
        enabled: true,
        url: `http://localhost:${process.env['E2E_OIDC_PORT'] ?? '18089'}`,
        realm: 'test',
        clientId: 'votivo-frontend',
        registrationEnabled: true,
        dpopMode: 'strict',
      },
    }),
  );
  await page.route('**/api/v1/**', (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path === '/api/v1/users/me' && req.method() === 'DELETE') {
      state.requests++;
      expect(req.headers()['authorization']).toBeTruthy();
      expect(req.headers()['dpop']).toBeTruthy();
      return route.fulfill({
        status: state.status,
        ...(state.status >= 400 ? { json: { status: state.status } } : {}),
      });
    }
    if (path.endsWith('/photo')) return route.fulfill({ status: 404 });
    if (path.endsWith('/header'))
      return route.fulfill({ json: { firstName: 'Alex', lastName: 'Morgan' } });
    if (path === '/api/v1/users/me')
      return route.fulfill({
        json: {
          id: 'e2e-user',
          firstName: 'Alex',
          lastName: 'Morgan',
          email: 'alex@example.test',
          emailVerified: true,
          enabled: true,
          roles: ['user'],
          createdAt: null,
          updatedAt: '2026-11-24T12:00:00Z',
        },
      });
    return route.fulfill({ json: { content: [], totalElements: 0, totalPages: 0 } });
  });
  await page.goto('/account?section=security');
  await page
    .getByRole('navigation', { name: 'Account', exact: true })
    .getByRole('button', { name: 'Sign in', exact: true })
    .click();
  await page.getByRole('button', { name: 'Continue as test user' }).click();
  await expect(page.getByRole('button', { name: 'Delete account', exact: true })).toBeVisible();
  return state;
}

test('deletion requires confirmation; blocked accounts and open polls preserve the session', async ({
  page,
}) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete your account?' });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(state.requests).toBe(0);
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await dialog.getByRole('button', { name: 'Delete account', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Close your published polls');
  await expect(page.locator('.account-menu')).toBeVisible();
  state.status = 403;
  await dialog.getByRole('button', { name: 'Delete account', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('blocked account');
  state.status = 503;
  await dialog.getByRole('button', { name: 'Delete account', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('temporarily unavailable');
  state.status = 204;
  await dialog.getByRole('button', { name: 'Delete account', exact: true }).click();
  await expect(page).toHaveURL(/\/polls$/);
  await expect(page.locator('.account-menu')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test('durably accepted deletion clears the local session', async ({ page }) => {
  const state = await setup(page);
  state.status = 202;
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete account', exact: true })
    .click();
  await expect(page).toHaveURL(/\/polls$/);
  await expect(page.locator('.account-menu')).toHaveCount(0);
});
