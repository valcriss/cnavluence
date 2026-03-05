import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const API_URL = 'http://127.0.0.1:3000';
const ADMIN_EMAIL = 'admin@cnavluence.local';
const ADMIN_PASSWORD = 'admin1234';

type LoginResult = {
  accessToken: string;
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

async function createPage(request: APIRequestContext, token: string, spaceId: string, title: string): Promise<string> {
  const response = await request.post(`${API_URL}/api/pages`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { spaceId, title, parentId: null },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { page: { id: string } };
  return body.page.id;
}

test('search relevance ranks title-only match before body-only match', async ({ page, request }) => {
  const admin = await apiLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);
  const spacesResponse = await request.get(`${API_URL}/api/spaces`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
  });
  expect(spacesResponse.ok()).toBeTruthy();
  const spacesBody = (await spacesResponse.json()) as { spaces: Array<{ id: string }> };
  const spaceId = spacesBody.spaces[0].id;

  const stamp = Date.now().toString(36);
  const term = `relevance_${stamp}`;
  const titleMatchId = await createPage(request, admin.accessToken, spaceId, `${term} title match`);
  const bodyMatchId = await createPage(request, admin.accessToken, spaceId, `Body only ${stamp}`);

  const saveBodyOnly = await request.put(`${API_URL}/api/content/${bodyMatchId}`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: {
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: `Contains ${term} in body only.` }],
          },
        ],
      },
    },
  });
  expect(saveBodyOnly.ok()).toBeTruthy();

  await uiLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto('/search');
  await page.getByPlaceholder('Search titles and content').fill(term);
  await page.getByRole('button', { name: 'Search' }).click();

  const cards = page.locator('[data-item-id]');
  await expect.poll(() => cards.count(), { timeout: 15000 }).toBeGreaterThanOrEqual(2);

  const ids = await cards.evaluateAll((nodes) =>
    nodes
      .map((node) => node.getAttribute('data-item-id'))
      .filter((value): value is string => typeof value === 'string'),
  );

  expect(ids).toContain(titleMatchId);
  expect(ids).toContain(bodyMatchId);
  expect(ids[0]).toBe(titleMatchId);
});
