import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const API_URL = 'http://127.0.0.1:3000';
const ADMIN_EMAIL = 'admin@cnavluence.local';
const ADMIN_PASSWORD = 'admin1234';

type LoginResult = {
  accessToken: string;
  user: { id: string };
};

async function uiLogin(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/search/);
}

async function apiLogin(request: APIRequestContext, email: string, password: string): Promise<LoginResult> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const response = await request.post(`${API_URL}/api/auth/login`, {
        data: { email, password },
      });
      if (response.ok()) {
        return (await response.json()) as LoginResult;
      }
      lastError = new Error(`Login failed with status ${response.status()}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError;
}

test('version history compares two versions and renders a textual diff', async ({ page, request }) => {
  const admin = await apiLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);

  const spacesResponse = await request.get(`${API_URL}/api/spaces`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
  });
  expect(spacesResponse.ok()).toBeTruthy();
  const spacesBody = (await spacesResponse.json()) as { spaces: Array<{ id: string; key: string }> };
  expect(spacesBody.spaces.length).toBeGreaterThan(0);
  const space = spacesBody.spaces[0];

  const stamp = Date.now().toString(36);
  const createPage = await request.post(`${API_URL}/api/pages`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: { spaceId: space.id, title: `Diff Page ${stamp}`, parentId: null },
  });
  expect(createPage.ok()).toBeTruthy();
  const pageBody = (await createPage.json()) as { page: { id: string; slug: string } };

  const baseline = `baseline_${stamp}`;
  const changed = `changed_${stamp}`;

  const saveV1 = await request.put(`${API_URL}/api/content/${pageBody.page.id}`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: {
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: baseline }] }],
      },
    },
  });
  expect(saveV1.ok()).toBeTruthy();
  const manualV1 = await request.post(`${API_URL}/api/versions/manual`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: { pageId: pageBody.page.id },
  });
  expect(manualV1.ok()).toBeTruthy();

  const saveV2 = await request.put(`${API_URL}/api/content/${pageBody.page.id}`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: {
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: changed }] }],
      },
    },
  });
  expect(saveV2.ok()).toBeTruthy();
  const manualV2 = await request.post(`${API_URL}/api/versions/manual`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: { pageId: pageBody.page.id },
  });
  expect(manualV2.ok()).toBeTruthy();

  await uiLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto(`/space/${space.key}/pages/${pageBody.page.id}-${pageBody.page.slug}?edit=1`);
  await expect(page.locator('.toolbar .fa-clock').first()).toBeVisible();
  await page.locator('.toolbar .fa-clock').first().locator('..').click();

  const modal = page.locator('.modal');
  await expect(modal.getByRole('heading', { level: 2, name: 'Version history' })).toBeVisible();
  await modal.getByRole('button', { name: 'Compare' }).click();

  const diffOutput = modal.locator('.diff-output');
  await expect(diffOutput).toContainText(`- ${baseline}`);
  await expect(diffOutput).toContainText(`+ ${changed}`);
});
