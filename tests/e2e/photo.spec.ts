import { test, expect, Page } from '@playwright/test';

async function setup(page: Page) {
  page.on('pageerror', (error) => console.log('Browser error:', error.message));
  const state = { photo: null as Buffer | null, uploads: 0, failSave: false, failDelete: false };
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
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/photo')) {
      const method = route.request().method();
      if (method === 'PUT') {
        state.uploads++;
        if (state.failSave) return route.fulfill({ status: 503, json: {} });
        const request = route.request();
        expect(request.headers()['authorization']).toBeTruthy();
        expect(request.headers()['dpop']).toBeTruthy();
        const body = request.postDataBuffer()!;
        const boundary = request.headers()['content-type'].split('boundary=')[1];
        const start = body.indexOf('\r\n\r\n') + 4;
        const end = body.indexOf('\r\n--' + boundary, start);
        expect(body.toString('utf8', 0, start)).toContain('name="file"; filename="profile.jpg"');
        state.photo = body.subarray(start, end);
        return route.fulfill({ status: 204 });
      }
      if (method === 'DELETE') {
        if (state.failDelete) return route.fulfill({ status: 503, json: {} });
        state.photo = null;
        return route.fulfill({ status: 204 });
      }
      return state.photo
        ? route.fulfill({ contentType: 'image/jpeg', body: state.photo })
        : route.fulfill({ status: 404, json: {} });
    }
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
  await page.goto('/account');
  await page
    .getByRole('navigation', { name: 'Account', exact: true })
    .getByRole('button', { name: 'Sign in', exact: true })
    .click();
  await page.getByRole('button', { name: 'Continue as test user' }).click();
  await expect(page.getByRole('button', { name: 'Add photo', exact: true })).toBeEnabled();
  return state;
}

async function imageFile(page: Page, color = '#367366') {
  const data = await page.evaluate((color) => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#e6d8bd';
    ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(400, 590, 220, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b97652';
    ctx.beginPath();
    ctx.arc(400, 260, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#263b36';
    ctx.beginPath();
    ctx.arc(400, 210, 125, Math.PI, Math.PI * 2);
    ctx.fill();
    return canvas.toDataURL('image/png').split(',')[1];
  }, color);
  return { name: 'portrait.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
}

test('crop, zoom, save, reload, replace and remove profile photo', async ({ page }, info) => {
  const state = await setup(page);
  await page.getByLabel('Choose profile photo').setInputFiles(await imageFile(page));
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Save photo', exact: true })).toBeEnabled();
  await dialog.getByRole('slider', { name: 'Zoom', exact: true }).fill('1.5');
  await expect(dialog.locator('output')).toHaveText('150%');
  await page.screenshot({
    path: `test-results/photo-crop-${info.project.name}.png`,
    fullPage: true,
  });
  const overflow = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll('*')]
      .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
      .map((e) => ({ tag: e.tagName, cls: e.className, right: e.getBoundingClientRect().right }))
      .slice(0, 12),
  }));
  expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width);
  await dialog.getByRole('button', { name: 'Save photo', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.photo-preview img')).toBeVisible();
  expect(state.uploads).toBe(1);
  expect(state.photo!.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  const size = await page.locator('.photo-preview img').evaluate((img: HTMLImageElement) => ({
    width: img.naturalWidth,
    height: img.naturalHeight,
  }));
  expect(size.width).toBeGreaterThan(0);
  expect(size.width).toBeLessThanOrEqual(512);
  expect(size.width).toBe(size.height);
  await expect(page.locator('.avatar img')).toHaveAttribute(
    'src',
    await page.locator('.photo-preview img').getAttribute('src'),
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Change photo', exact: true })).toBeEnabled();
  await page.getByLabel('Choose profile photo').setInputFiles(await imageFile(page, '#365573'));
  await expect(dialog.getByRole('button', { name: 'Save photo', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Save photo', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(state.uploads).toBe(2);
  await page.screenshot({
    path: `test-results/photo-profile-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Remove photo', exact: true }).click();
  await expect(page.locator('.photo-preview img')).toHaveCount(0);
  await expect(page.locator('.avatar img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add photo', exact: true })).toBeEnabled();
  expect(state.photo).toBeNull();
});

test('rejects invalid files and cancels cropping without uploading', async ({ page }) => {
  const state = await setup(page);
  const input = page.getByLabel('Choose profile photo');
  await input.setInputFiles({
    name: 'bad.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg/>'),
  });
  await expect(page.getByRole('alert')).toContainText('JPEG or PNG');
  await input.setInputFiles({
    name: 'large.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole('alert')).toContainText('smaller than 5 MB');
  await input.setInputFiles({
    name: 'broken.png',
    mimeType: 'image/png',
    buffer: Buffer.from('broken'),
  });
  await expect(page.getByRole('alert')).toContainText('could not be opened');
  const photo = await imageFile(page);
  await input.setInputFiles(photo);
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Save photo', exact: true }),
  ).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await input.setInputFiles(photo);
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Save photo', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(state.uploads).toBe(0);
});

test('failed save can be retried; failed removal preserves the current photo', async ({ page }) => {
  const state = await setup(page);
  await page.getByLabel('Choose profile photo').setInputFiles(await imageFile(page));
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Save photo', exact: true })).toBeEnabled();
  state.failSave = true;
  await dialog.getByRole('button', { name: 'Save photo', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Could not update your photo');
  state.failSave = false;
  await dialog.getByRole('button', { name: 'Save photo', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  state.failDelete = true;
  await page.getByRole('button', { name: 'Remove photo', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not update your photo');
  await expect(page.locator('.photo-preview img')).toBeVisible();
  state.failDelete = false;
  await page.getByRole('button', { name: 'Remove photo', exact: true }).click();
  await expect(page.locator('.photo-preview img')).toHaveCount(0);
});
