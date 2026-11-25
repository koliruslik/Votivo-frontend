import { test, expect, Page } from '@playwright/test';

async function setup(page: Page) {
  const state = { blocked: false, checks: 0 };
  await page.route('**/auth-config.json', route => route.fulfill({ json: {
    enabled: true, url: `http://localhost:${process.env['E2E_OIDC_PORT'] ?? '18089'}`,
    realm: 'test', clientId: 'votivo-frontend', registrationEnabled: false, dpopMode: 'strict',
  } }));
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/photo')) return route.fulfill({ status: 404 });
    if (path.endsWith('/header') || path.endsWith('/mine')) {
      state.checks++;
      if (state.blocked) return route.fulfill({ status: 403,
        headers: { 'X-Account-Access': 'denied' }, json: { message: 'Account access has been revoked' } });
    }
    if (path.endsWith('/header')) return route.fulfill({ json: { firstName: 'Alex', lastName: 'Morgan' } });
    return route.fulfill({ json: { content: [], page: 0, size: 12, totalElements: 0, totalPages: 0 } });
  });
  await page.goto('/polls');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Continue as test user' }).click();
  await expect(page.locator('.account-menu')).toBeVisible();
  return state;
}

test('blocked session is cleared on a protected request and public browsing remains available', async ({ page }) => {
  const state = await setup(page);
  state.blocked = true;
  await page.locator('.account-menu summary').click();
  await page.getByRole('link', { name: 'My polls', exact: true }).click();
  await expect(page).toHaveURL(/\/polls$/);
  await expect(page.locator('.global-notice')).toContainText('account is blocked');
  await expect(page.locator('.account-menu')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Explore polls', exact: true })).toBeVisible();
});

test('returning to an open tab checks access and clears a blocked session', async ({ page }) => {
  const state = await setup(page);
  const before = state.checks;
  state.blocked = true;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('.global-notice')).toContainText('account is blocked');
  await expect(page.locator('.account-menu')).toHaveCount(0);
  expect(state.checks).toBeGreaterThan(before);
});
