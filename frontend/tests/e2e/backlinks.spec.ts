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

test('page view shows backlinks from internal linked pages', async ({ page, request }) => {
  const admin = await apiLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);

  const spacesResponse = await request.get(`${API_URL}/api/spaces`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
  });
  expect(spacesResponse.ok()).toBeTruthy();
  const spacesBody = (await spacesResponse.json()) as { spaces: Array<{ id: string; key: string }> };
  expect(spacesBody.spaces.length).toBeGreaterThan(0);
  const space = spacesBody.spaces[0];

  const stamp = Date.now().toString(36);
  const targetTitle = `Backlink Target ${stamp}`;
  const sourceTitle = `Backlink Source ${stamp}`;

  const createTarget = await request.post(`${API_URL}/api/pages`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: { spaceId: space.id, title: targetTitle, parentId: null },
  });
  expect(createTarget.ok()).toBeTruthy();
  const targetBody = (await createTarget.json()) as { page: { id: string; slug: string } };

  const createSource = await request.post(`${API_URL}/api/pages`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: { spaceId: space.id, title: sourceTitle, parentId: null },
  });
  expect(createSource.ok()).toBeTruthy();
  const sourceBody = (await createSource.json()) as { page: { id: string; slug: string } };

  const linkHref = `/space/${space.key}/pages/${targetBody.page.id}-${targetBody.page.slug}`;
  const saveSourceContent = await request.put(`${API_URL}/api/content/${sourceBody.page.id}`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: {
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Related page',
                marks: [{ type: 'link', attrs: { href: linkHref } }],
              },
            ],
          },
        ],
      },
    },
  });
  expect(saveSourceContent.ok()).toBeTruthy();

  await uiLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto(`/space/${space.key}/pages/${targetBody.page.id}-${targetBody.page.slug}`);

  const backlinksSection = page.locator('.backlinks');
  await expect(backlinksSection.getByRole('heading', { level: 2, name: 'Backlinks' })).toBeVisible();
  await expect(backlinksSection.getByRole('link', { name: sourceTitle })).toBeVisible();
});
