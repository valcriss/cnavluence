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

async function createPage(
  request: APIRequestContext,
  token: string,
  spaceId: string,
  title: string,
): Promise<{ id: string; title: string }> {
  const response = await request.post(`${API_URL}/api/pages`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { spaceId, title, parentId: null },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { page: { id: string } };
  return { id: body.page.id, title };
}

test('search infinite pagination returns full result set without duplicates', async ({ page, request }) => {
  const admin = await apiLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);
  const spacesResponse = await request.get(`${API_URL}/api/spaces`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
  });
  expect(spacesResponse.ok()).toBeTruthy();
  const spacesBody = (await spacesResponse.json()) as { spaces: Array<{ id: string }> };
  expect(spacesBody.spaces.length).toBeGreaterThan(0);
  const spaceId = spacesBody.spaces[0].id;

  const stamp = Date.now().toString(36);
  const searchTerm = `searchpager_${stamp}`;
  const created: Array<{ id: string; title: string }> = [];
  for (let index = 0; index < 45; index += 1) {
    created.push(await createPage(request, admin.accessToken, spaceId, `${searchTerm} title ${index}`));
  }

  await uiLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto('/search');
  await page.getByPlaceholder('Search titles and content').fill(searchTerm);
  await page.getByRole('button', { name: 'Search' }).click();

  const cards = page.locator('[data-item-id]');
  await expect.poll(() => cards.count(), { timeout: 10000 }).toBeGreaterThanOrEqual(20);

  let guard = 0;
  while (guard < 10) {
    const currentCount = await cards.count();
    if (currentCount >= created.length) {
      break;
    }

    const sentinel = page.locator('.sentinel');
    if ((await sentinel.count()) === 0) {
      break;
    }

    await sentinel.scrollIntoViewIfNeeded();
    await expect.poll(() => cards.count(), { timeout: 10000 }).toBeGreaterThan(currentCount);
    guard += 1;
  }

  await expect.poll(() => cards.count(), { timeout: 15000 }).toBe(created.length);

  const ids = await cards.evaluateAll((nodes) =>
    nodes
      .map((node) => node.getAttribute('data-item-id'))
      .filter((value): value is string => typeof value === 'string'),
  );
  expect(new Set(ids).size).toBe(ids.length);

  const firstTitle = await page.locator('.card h3').first().innerText();
  expect(firstTitle).toContain(searchTerm);
});
