import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const API_URL = 'http://127.0.0.1:3000';
const ADMIN_EMAIL = 'admin@cnavluence.local';
const ADMIN_PASSWORD = 'admin1234';

type LoginResult = {
  accessToken: string;
  user: { id: string; displayName: string };
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

async function createAuditedPageEvents(request: APIRequestContext, token: string) {
  const spacesResponse = await request.get(`${API_URL}/api/spaces`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(spacesResponse.ok()).toBeTruthy();
  const spacesBody = (await spacesResponse.json()) as { spaces: Array<{ id: string; key: string }> };
  expect(spacesBody.spaces.length).toBeGreaterThan(0);
  const space = spacesBody.spaces[0];

  const stamp = Date.now().toString(36);
  const createdTitle = `Audit Source ${stamp}`;
  const renamedTitle = `Audit Renamed ${stamp}`;

  const createPage = await request.post(`${API_URL}/api/pages`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { spaceId: space.id, title: createdTitle, parentId: null },
  });
  expect(createPage.ok()).toBeTruthy();
  const pageBody = (await createPage.json()) as { page: { id: string } };

  const renamePage = await request.patch(`${API_URL}/api/pages/${pageBody.page.id}/rename`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { title: renamedTitle },
  });
  expect(renamePage.ok()).toBeTruthy();

  return {
    spaceId: space.id,
    pageId: pageBody.page.id,
    pageTitle: renamedTitle,
  };
}

async function createPaginatedAuditEvents(request: APIRequestContext, token: string, renameCount: number) {
  const spacesResponse = await request.get(`${API_URL}/api/spaces`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(spacesResponse.ok()).toBeTruthy();
  const spacesBody = (await spacesResponse.json()) as { spaces: Array<{ id: string }> };
  expect(spacesBody.spaces.length).toBeGreaterThan(0);
  const space = spacesBody.spaces[0];

  const stamp = Date.now().toString(36);
  const createPage = await request.post(`${API_URL}/api/pages`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { spaceId: space.id, title: `Audit Pager ${stamp}`, parentId: null },
  });
  expect(createPage.ok()).toBeTruthy();
  const pageBody = (await createPage.json()) as { page: { id: string } };

  for (let index = 0; index < renameCount; index += 1) {
    const rename = await request.patch(`${API_URL}/api/pages/${pageBody.page.id}/rename`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: `Audit Pager ${stamp} v${index + 1}` },
    });
    expect(rename.ok()).toBeTruthy();
  }

  return {
    spaceId: space.id,
    pageId: pageBody.page.id,
    expectedCount: renameCount + 1,
  };
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

test('audit page filters by space/page/date and renders timeline entries', async ({ page, request }) => {
  const admin = await apiLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);
  const data = await createAuditedPageEvents(request, admin.accessToken);

  await uiLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto('/audit');
  await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();

  await page.getByLabel('Space').selectOption(data.spaceId);
  await page.getByLabel('Page').selectOption(data.pageId);

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  await page.getByLabel('From').fill(toDateInputValue(today));
  await page.getByLabel('To').fill(toDateInputValue(today));
  await page.getByRole('button', { name: 'Apply filters' }).click();

  await expect(page.getByText(data.pageTitle).first()).toBeVisible();
  await expect(page.getByText('Page Created')).toBeVisible();
  await expect(page.getByText('Page Renamed')).toBeVisible();
  await expect(page.getByText(admin.user.displayName).first()).toBeVisible();

  await page.getByLabel('From').fill(toDateInputValue(tomorrow));
  await page.getByLabel('To').fill(toDateInputValue(tomorrow));
  await page.getByRole('button', { name: 'Apply filters' }).click();

  await expect(page.getByText('No events found for these filters.')).toBeVisible();
});

test('audit page paginates with infinite scroll and appends timeline entries', async ({ page, request }) => {
  const admin = await apiLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);
  const data = await createPaginatedAuditEvents(request, admin.accessToken, 25);

  await uiLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto('/audit');
  await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();

  await page.getByLabel('Space').selectOption(data.spaceId);
  await page.getByLabel('Page').selectOption(data.pageId);

  const today = new Date();
  await page.getByLabel('From').fill(toDateInputValue(today));
  await page.getByLabel('To').fill(toDateInputValue(today));
  await page.getByRole('button', { name: 'Apply filters' }).click();

  const timelineItems = page.locator('.timeline-item');
  await expect(timelineItems).toHaveCount(20);
  await expect(page.locator('.audit-sentinel')).toBeVisible();

  await page.locator('.audit-sentinel').scrollIntoViewIfNeeded();
  await expect(timelineItems).toHaveCount(data.expectedCount);
  await expect(page.locator('.audit-sentinel')).toHaveCount(0);
});
