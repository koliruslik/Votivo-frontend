import { test, expect, Page } from '@playwright/test';

async function setup(page: Page, admin = true) {
  if (admin)
    await page.context().addCookies([
      {
        name: 'votivo-test-admin',
        value: 'true',
        url: `http://localhost:${process.env['E2E_OIDC_PORT'] ?? '18089'}`,
      },
    ]);
  const people = Array.from({ length: 26 }, (_, index) => ({
    id: index === 0 ? 'e2e-user' : `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
    firstName: index === 0 ? 'Alex' : index === 1 ? 'Ada' : index === 2 ? 'Olena' : 'Member',
    lastName:
      index === 0 ? 'Morgan' : index === 1 ? 'Lovelace' : index === 2 ? 'Koval' : String(index),
    email:
      index === 0
        ? 'alex@example.test'
        : index === 1
          ? 'ada@example.test'
          : index === 2
            ? 'olena@example.test'
            : `member${index}@example.test`,
    enabled: index % 3 !== 2,
    emailVerified: true,
    roles: index === 0 ? ['admin', 'user'] : ['user'],
    createdAt: '2026-11-20T12:00:00Z',
    updatedAt: '2026-11-24T12:00:00Z',
  }));
  const state = { fail: false, mutations: 0, lists: 0, queries: [] as string[] };
  await page.route('**/auth-config.json', (route) =>
    route.fulfill({
      json: {
        enabled: true,
        url: `http://localhost:${process.env['E2E_OIDC_PORT'] ?? '18089'}`,
        realm: 'test',
        clientId: 'votivo-frontend',
        registrationEnabled: false,
        dpopMode: 'strict',
      },
    }),
  );
  await page.route('**/api/v1/**', (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.pathname === '/api/v1/admin/users') {
      state.lists++;
      state.queries.push(url.search);
      const query = (url.searchParams.get('search') ?? '').toLowerCase();
      const enabled = url.searchParams.get('enabled');
      const filtered = people.filter(
        (p) =>
          `${p.firstName} ${p.lastName} ${p.email}`.toLowerCase().includes(query) &&
          (enabled === null || p.enabled === (enabled === 'true')),
      );
      const page = Number(url.searchParams.get('page') ?? 0),
        size = 20;
      return route.fulfill({
        json: {
          items: filtered.slice(page * size, (page + 1) * size),
          page,
          size,
          totalElements: filtered.length,
          totalPages: Math.ceil(filtered.length / size),
        },
      });
    }
    if (url.pathname.endsWith('/status') && req.method() === 'PATCH') {
      state.mutations++;
      if (state.fail) return route.fulfill({ status: 503, json: {} });
      const id = url.pathname.split('/').at(-2);
      const person = people.find((p) => p.id === id)!;
      person.enabled = req.postDataJSON().enabled;
      return route.fulfill({ json: person });
    }
    if (url.pathname.endsWith('/photo')) return route.fulfill({ status: 404, json: {} });
    if (url.pathname.endsWith('/header'))
      return route.fulfill({ json: { firstName: 'Alex', lastName: 'Morgan' } });
    if (url.pathname === '/api/v1/users/me') return route.fulfill({ json: people[0] });
    return route.fulfill({ json: { content: [], totalElements: 0, totalPages: 0 } });
  });
  await page.goto('/polls');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Continue as test user' }).click();
  if (admin) {
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Users 26', exact: true })).toBeVisible();
  } else await expect(page.locator('.account-menu')).toBeVisible();
  return state;
}

test('provisioned administrator lands on users and can search, page, block and unblock', async ({
  page,
}, info) => {
  const state = await setup(page);
  await expect(
    page.getByRole('button', { name: 'Block alex@example.test', exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: `test-results/admin-users-${info.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search users' }).fill('Ada');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'ada@example.test' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Block ada@example.test', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Block account', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(row.getByText('Blocked', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Account status', exact: true }).selectOption('blocked');
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Unblock ada@example.test', exact: true }).click();
  await dialog.getByRole('button', { name: 'Unblock account', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'No users found', exact: true })).toBeVisible();
  expect(state.mutations).toBe(2);
  expect(state.queries.some((query) => query.includes('page=1'))).toBe(true);
  await page.getByRole('combobox', { name: 'Account status', exact: true }).selectOption('all');
  await expect(row.getByText('Active', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Polls', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/polls$/);
  await page.getByRole('link', { name: 'Users', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search users' })).toHaveValue('Ada');
  await expect(row.getByText('Active', { exact: true })).toBeVisible();
});

test('cancel and failed status changes preserve the account; a retry succeeds', async ({
  page,
}) => {
  const state = await setup(page);
  await page.getByRole('button', { name: 'Block ada@example.test', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(state.mutations).toBe(0);
  await page.getByRole('button', { name: 'Block ada@example.test', exact: true }).click();
  state.fail = true;
  await dialog.getByRole('button', { name: 'Block account', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('temporarily unavailable');
  state.fail = false;
  await dialog.getByRole('button', { name: 'Block account', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Unblock ada@example.test', exact: true }),
  ).toBeVisible();
});

test('ordinary users cannot enter the administrator panel', async ({ page }) => {
  const state = await setup(page, false);
  await expect(page).toHaveURL(/\/polls$/);
  await expect(page.getByRole('link', { name: 'Administration', exact: true })).toHaveCount(0);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/polls$/);
  expect(state.lists).toBe(0);
});

test('administrator has only user and poll management navigation', async ({ page }) => {
  await setup(page);
  await expect(page.getByRole('link', { name: 'My account', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'My polls', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Explore', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.goto('/account');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('button', { name: 'Delete account', exact: true })).toHaveCount(0);
  await page.goto('/polls/new');
  await expect(page).toHaveURL(/\/admin$/);
});
