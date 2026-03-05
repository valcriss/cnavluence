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
  parentId: string | null,
): Promise<{ id: string; slug: string }> {
  const response = await request.post(`${API_URL}/api/pages`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { spaceId, title, parentId },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { page: { id: string; slug: string } };
  return body.page;
}

async function fetchParentId(
  request: APIRequestContext,
  token: string,
  spaceId: string,
  pageId: string,
): Promise<string | null> {
  const response = await request.get(`${API_URL}/api/pages/space/${spaceId}/tree`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    pages: Array<{ id: string; parentId: string | null }>;
  };
  const page = body.pages.find((item) => item.id === pageId);
  return page?.parentId ?? null;
}

test('sidebar supports drag and drop move between pages and to root', async ({ page, request }) => {
  const admin = await apiLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);

  const spacesResponse = await request.get(`${API_URL}/api/spaces`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
  });
  expect(spacesResponse.ok()).toBeTruthy();
  const spacesBody = (await spacesResponse.json()) as { spaces: Array<{ id: string; key: string; name: string }> };
  expect(spacesBody.spaces.length).toBeGreaterThan(0);
  const space = spacesBody.spaces[0];

  const stamp = Date.now().toString(36);
  const parentA = await createPage(request, admin.accessToken, space.id, `DnD Parent A ${stamp}`, null);
  const parentB = await createPage(request, admin.accessToken, space.id, `DnD Parent B ${stamp}`, null);
  const child = await createPage(request, admin.accessToken, space.id, `DnD Child ${stamp}`, parentA.id);

  await uiLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto(`/space/${space.key}/pages/${child.id}-${child.slug}`);

  const childItem = page.locator(`[data-page-id="${child.id}"]`);
  const parentBItem = page.locator(`[data-page-id="${parentB.id}"]`);
  await expect(childItem).toBeVisible();
  await expect(parentBItem).toBeVisible();

  await childItem.dragTo(parentBItem);

  await expect
    .poll(() => fetchParentId(request, admin.accessToken, space.id, child.id), { timeout: 8000 })
    .toBe(parentB.id);

  await childItem.dragTo(page.getByTestId('root-dropzone'));
  await expect
    .poll(() => fetchParentId(request, admin.accessToken, space.id, child.id), { timeout: 8000 })
    .toBeNull();
});

test('sidebar blocks drag and drop cycle (parent into descendant)', async ({ page, request }) => {
  const admin = await apiLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);

  const spacesResponse = await request.get(`${API_URL}/api/spaces`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
  });
  expect(spacesResponse.ok()).toBeTruthy();
  const spacesBody = (await spacesResponse.json()) as { spaces: Array<{ id: string; key: string }> };
  expect(spacesBody.spaces.length).toBeGreaterThan(0);
  const space = spacesBody.spaces[0];

  const stamp = Date.now().toString(36);
  const parent = await createPage(request, admin.accessToken, space.id, `Cycle Parent ${stamp}`, null);
  const child = await createPage(request, admin.accessToken, space.id, `Cycle Child ${stamp}`, parent.id);
  const grandChild = await createPage(request, admin.accessToken, space.id, `Cycle GrandChild ${stamp}`, child.id);

  await uiLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto(`/space/${space.key}/pages/${grandChild.id}-${grandChild.slug}`);

  const parentItem = page.locator(`[data-page-id="${parent.id}"]`);
  const grandChildItem = page.locator(`[data-page-id="${grandChild.id}"]`);
  await expect(parentItem).toBeVisible();
  await expect(grandChildItem).toBeVisible();

  await parentItem.dragTo(grandChildItem);
  await expect
    .poll(async () => {
      const parentParentId = await fetchParentId(request, admin.accessToken, space.id, parent.id);
      const childParentId = await fetchParentId(request, admin.accessToken, space.id, child.id);
      const grandChildParentId = await fetchParentId(request, admin.accessToken, space.id, grandChild.id);
      return `${parentParentId ?? 'null'}|${childParentId ?? 'null'}|${grandChildParentId ?? 'null'}`;
    })
    .toBe(`null|${parent.id}|${child.id}`);
});
