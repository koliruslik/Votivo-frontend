import { test, expect, Page } from '@playwright/test';
const id = '11111111-1111-4111-8111-111111111111';
const question = '22222222-2222-4222-8222-222222222222';
const first = '33333333-3333-4333-8333-333333333333';
const second = '44444444-4444-4444-8444-444444444444';
const poll = {
  id,
  title: 'Where should we meet next?',
  description: 'Choose a place for our next community gathering.',
  ownerId: 'e2e-user',
  status: 'PUBLISHED',
  accessType: 'PUBLIC',
  anonymous: false,
  allowVoteChange: true,
  blocked: false,
  createdAt: '2026-11-20T12:00:00Z',
  endsAt: '2099-12-31T12:00:00Z',
  questions: [
    {
      id: question,
      text: 'Which venue works best?',
      type: 'SINGLE',
      options: [
        { id: first, text: 'The neighbourhood cafe' },
        { id: second, text: 'Riverside park' },
      ],
    },
  ],
};
async function setup(page: Page, signedIn = false) {
  await page.route('**/auth-config.json', (route) =>
    route.fulfill({
      json: {
        enabled: signedIn,
        url: `http://localhost:${process.env['E2E_OIDC_PORT'] ?? '18089'}`,
        realm: 'test',
        clientId: 'votivo-frontend',
        registrationEnabled: true,
        dpopMode: 'strict',
      },
    }),
  );
  let voted = false;
  let currentPoll = { ...poll };
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname.endsWith('/vote')) {
      if (method === 'GET') return route.fulfill({ json: { voted } });
      voted = method !== 'DELETE';
      return route.fulfill({ json: { message: 'ok' } });
    }
    if (url.pathname.endsWith('/results'))
      return route.fulfill({
        json: {
          pollId: id,
          title: poll.title,
          status: 'ACTIVE',
          totalVotes: voted ? 25 : 24,
          questions: [
            {
              questionId: question,
              text: poll.questions[0].text,
              multiple: false,
              options: [
                {
                  optionId: first,
                  text: poll.questions[0].options[0].text,
                  votes: voted ? 17 : 16,
                },
                { optionId: second, text: poll.questions[0].options[1].text, votes: 8 },
              ],
            },
          ],
        },
      });
    if (url.pathname.endsWith('/publish')) {
      currentPoll = { ...poll };
      return route.fulfill({ json: currentPoll });
    }
    if (method === 'POST' && url.pathname === '/api/v1/polls') {
      currentPoll = { ...poll, status: 'DRAFT' };
      return route.fulfill({ status: 201, json: currentPoll });
    }
    if (url.pathname === `/api/v1/polls/${id}`) return route.fulfill({ json: currentPoll });
    const titles = [
      'Where should we meet next?',
      'A better commute, together',
      'Choose our next book',
      'What matters in your neighbourhood?',
      'Plan the next team day',
      'A small change for a greener office',
    ];
    return route.fulfill({
      json: {
        content: titles.map((title, i) => ({
          ...poll,
          id: i === 0 ? id : `11111111-1111-4111-8111-11111111111${i + 1}`,
          title,
          anonymous: i % 2 === 1,
        })),
        page: 0,
        size: 12,
        totalElements: 6,
        totalPages: 1,
      },
    });
  });
}
async function login(page: Page) {
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Continue as test user' }).click();
  const summary = page.locator('.account-menu summary');
  await expect(summary).toBeVisible();
  await summary.click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await summary.click();
}
test('catalog, search, filters, navigation and mobile layout', async ({ page }, info) => {
  await setup(page);
  await page.goto('/polls');
  await expect(page.getByRole('heading', { name: 'Explore polls' })).toBeVisible();
  await expect(page.locator('.poll-card')).toHaveCount(6);
  await page.screenshot({ path: `test-results/catalog-${info.project.name}.png`, fullPage: true });
  await page.getByRole('searchbox').fill('commute');
  await expect(page.locator('.poll-card')).toHaveCount(1);
  await page.getByRole('searchbox').fill('');
  await page.getByRole('button', { name: 'Anonymous', exact: true }).click();
  await expect(page.locator('.poll-card')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByRole('link', { name: 'Help', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Good questions. Clear answers.' })).toBeVisible();
});
test('public poll, result percentages and absent route', async ({ page }, info) => {
  await setup(page);
  await page.goto(`/polls/${id}`);
  await expect(page.getByRole('heading', { name: poll.title })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  await expect(page.getByText('66.7%', { exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/results-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/missing');
  await expect(page.getByRole('heading', { name: 'This page isn’t here' })).toBeVisible();
});
test('authenticated create flow, vote and withdraw', async ({ page }, info) => {
  await setup(page, true);
  await page.goto('/polls');
  await login(page);
  await page.getByRole('link', { name: 'Create poll', exact: true }).click();
  await page.getByLabel('Poll title').fill('A new team poll');
  await page.getByLabel('Voting ends', { exact: true }).fill('2099-12-31T14:00');
  await page.getByLabel('Question *', { exact: true }).fill('Where next?');
  await page.getByLabel('Question 1, option 1', { exact: true }).fill('Cafe');
  await page.getByLabel('Question 1, option 2', { exact: true }).fill('Park');
  await page.getByLabel('Anonymous responses').check();
  await expect(page.getByLabel('Allow vote changes')).toBeDisabled();
  await page.screenshot({ path: `test-results/editor-${info.project.name}.png`, fullPage: true });
  const saved = page.waitForRequest(
    (req) => req.method() === 'POST' && req.url().endsWith('/api/v1/polls'),
  );
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  expect((await saved).postDataJSON()).toMatchObject({
    title: 'A new team poll',
    anonymous: true,
    allowVoteChange: false,
    endsAt: await page.evaluate(() => new Date('2099-12-31T14:00').toISOString()),
  });
  await expect(page.getByRole('heading', { name: poll.title })).toBeVisible();
  await page.getByRole('button', { name: 'Publish poll', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publish poll', exact: true }).click();
  await page.getByRole('radio', { name: 'The neighbourhood cafe' }).check();
  const sent = page.waitForRequest((req) => req.method() === 'POST' && req.url().endsWith('/vote'));
  await page.getByRole('button', { name: 'Submit vote' }).click();
  const request = await sent;
  expect(request.postDataJSON()).toEqual({
    answers: [{ question_id: question, option_ids: [first] }],
  });
  expect(request.headers()['authorization']).toMatch(/^DPoP /);
  expect(request.headers()['dpop']).toBeTruthy();
  await expect(page.getByText('Your vote has been saved.', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'Your response' }).click();
  await page.getByRole('button', { name: 'Withdraw my vote' }).click();
  await page.getByRole('button', { name: 'Withdraw vote', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Your vote has been withdrawn.');
});
test('backend failure is recoverable and is not shown as an empty catalog', async ({ page }) => {
  await setup(page);
  let fail = true;
  await page.route('**/api/v1/polls?*', (route) =>
    fail
      ? route.fulfill({ status: 503, json: {} })
      : route.fulfill({ json: { content: [], totalElements: 0, totalPages: 0 } }),
  );
  await page.goto('/polls');
  await expect(page.getByRole('alert')).toContainText('Couldn’t load polls');
  await expect(page.getByRole('heading', { name: 'No polls here yet' })).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'No polls here yet' })).toBeVisible();
});

test('draft editing preserves question order and settings, and protects unsaved changes', async ({
  page,
}) => {
  await setup(page, true);
  let state = { ...poll, status: 'DRAFT' };
  let release: (() => Promise<void>) | undefined;
  let saved: any;
  await page.route(`**/api/v1/polls/${id}`, async (route) => {
    if (route.request().method() === 'PUT') {
      saved = route.request().postDataJSON();
      state = {
        ...state,
        ...saved,
        questions: saved.questions.map((q: any, i: number) => ({
          ...q,
          id: `question-${i}`,
          options: q.options.map((o: any, j: number) => ({ ...o, id: `option-${i}-${j}` })),
        })),
      };
      release = () => route.fulfill({ json: state });
    } else await route.fulfill({ json: state });
  });
  await page.goto('/polls');
  await login(page);
  await page.goto(`/polls/${id}/edit`);
  await page.getByLabel('Poll title').fill('Updated team poll');
  await page.getByLabel('Who can find it?').selectOption('LINK');
  await page.getByLabel('Answer type').selectOption('MULTIPLE');
  await page.getByRole('button', { name: 'Add option' }).click();
  await page.getByLabel('Question 1, option 3', { exact: true }).fill('Community centre');
  await page.getByRole('button', { name: 'Add question' }).click();
  await page.getByLabel('Question *', { exact: true }).nth(1).fill('When?');
  await page.getByLabel('Question 2, option 1', { exact: true }).fill('Monday');
  await page.getByLabel('Question 2, option 2', { exact: true }).fill('Friday');
  await page.getByRole('button', { name: 'Move question 2 up', exact: true }).click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('.back-link').click();
  await expect(page).toHaveURL(new RegExp(`/polls/${id}/edit$`));
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByLabel('Poll title')).toBeDisabled();
  await expect.poll(() => !!release).toBe(true);
  expect(saved).toMatchObject({
    title: 'Updated team poll',
    accessType: 'LINK',
    questions: [
      { text: 'When?', type: 'SINGLE' },
      { text: poll.questions[0].text, type: 'MULTIPLE' },
    ],
  });
  expect(saved.questions[1].options).toHaveLength(3);
  await release!();
  await expect(page.getByRole('heading', { name: 'Updated team poll', exact: true })).toBeVisible();
});

test('shared anonymous poll carries link access and keeps prior responses locked', async ({
  page,
}) => {
  await setup(page, true);
  const token = '55555555-5555-4555-8555-555555555555';
  await page.route(`**/api/v1/polls/by-link/${token}`, (route) =>
    route.fulfill({
      json: {
        ...poll,
        ownerId: 'another-user',
        accessType: 'LINK',
        shareToken: null,
        anonymous: true,
        allowVoteChange: false,
      },
    }),
  );
  await page.route(`**/api/v1/polls/${id}/vote?*`, (route) =>
    route.fulfill({ json: { voted: true } }),
  );
  await page.goto('/polls');
  await login(page);
  await page.goto(`/s/${token}`);
  await expect(page.getByRole('tab', { name: 'Your response' })).toBeVisible();
  await expect(page.getByRole('radio').first()).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Edit response' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Withdraw my vote' })).toHaveCount(0);
  await expect(page.getByLabel('Poll link', { exact: true })).toHaveValue(
    new URL(`/s/${token}`, page.url()).href,
  );
  const resultRequest = page.waitForRequest((request) =>
    new URL(request.url()).pathname.endsWith('/results'),
  );
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  expect(new URL((await resultRequest).url()).searchParams.get('shareToken')).toBe(token);
});

test('owner closes and archives a poll with explicit confirmation', async ({ page }) => {
  await setup(page, true);
  await page.route(`**/api/v1/polls/${id}/close`, (route) =>
    route.fulfill({ json: { ...poll, status: 'CLOSED' } }),
  );
  await page.route(`**/api/v1/polls/${id}/archive`, (route) =>
    route.fulfill({ json: { ...poll, status: 'ARCHIVED' } }),
  );
  await page.goto('/polls');
  await login(page);
  await page.locator('.poll-card').first().click();
  await page.getByRole('button', { name: 'Close voting', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close poll', exact: true }).click();
  await expect(page.getByText('Closed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Archive poll', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archive poll', exact: true }).click();
  await expect(page.getByText('Archived', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close voting', exact: true })).toHaveCount(0);
});

test('draft deadline is required for publication and survives editing in local time', async ({ page }) => {
  await setup(page, true);
  let draft = { ...poll, status: 'DRAFT', endsAt: null as string | null };
  await page.route(`**/api/v1/polls/${id}`, async route => {
    if (route.request().method() === 'PUT') {
      const input = route.request().postDataJSON();
      draft = { ...draft, ...input, questions: poll.questions };
    }
    await route.fulfill({ json: draft });
  });
  await page.goto('/polls');
  await login(page);
  await page.goto(`/polls/${id}`);
  await expect(page.getByRole('button', { name: 'Publish poll', exact: true })).toBeDisabled();
  await page.getByRole('link', { name: 'Edit draft', exact: true }).click();
  const field = page.getByLabel('Voting ends', { exact: true });
  await expect(field).toHaveValue('');
  await field.fill('2099-12-31T14:30');
  const request = page.waitForRequest(req => req.method() === 'PUT' && req.url().endsWith(`/polls/${id}`));
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  expect((await request).postDataJSON().endsAt).toBe(await page.evaluate(() => new Date('2099-12-31T14:30').toISOString()));
  await expect(page.getByRole('button', { name: 'Publish poll', exact: true })).toBeEnabled();
  await page.getByRole('link', { name: 'Edit draft', exact: true }).click();
  await expect(field).toHaveValue('2099-12-31T14:30');
});

test('voting becomes unavailable at the deadline without reloading the page', async ({ page }) => {
  await setup(page, true);
  await page.goto('/polls');
  await login(page);
  await page.route(`**/api/v1/polls/${id}`, route => route.fulfill({
    json: { ...poll, endsAt: new Date(Date.now() + 4000).toISOString() },
  }));
  await page.goto(`/polls/${id}`);
  const radio = page.getByRole('radio', { name: 'The neighbourhood cafe', exact: true });
  await expect(radio).toBeEnabled();
  await expect(radio).toBeDisabled({ timeout: 10000 });
  await expect(page.getByText('Closed', { exact: true })).toBeVisible();
  await expect(page.getByText('Voting has ended.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close voting', exact: true })).toHaveCount(0);
});

test('administrator reviews and blocks polls without participant or owner actions', async ({ page }, info) => {
  await page.context().addCookies([{ name: 'votivo-test-admin', value: 'true',
    url: `http://localhost:${process.env['E2E_OIDC_PORT'] ?? '18089'}` }]);
  await setup(page, true);
  await page.route(`**/api/v1/admin/polls/${id}/block`, route => route.fulfill({ json: { ...poll, blocked: true } }));
  await page.goto('/polls');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Continue as test user' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('link', { name: 'Polls', exact: true }).click();
  await page.getByRole('link', { name: 'Review ' + poll.title, exact: true }).click();
  await expect(page.getByRole('heading', { name: poll.title, exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/admin-poll-review-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Close voting', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Create poll', exact: true })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Administration sections', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Block poll', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Block poll', exact: true }).click();
  await expect(page.getByText('Blocked', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Block poll', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Users', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
});
