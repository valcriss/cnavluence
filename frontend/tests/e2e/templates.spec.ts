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

test('create page from template copies template content', async ({ page, request }) => {
  const admin = await apiLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);
  const spacesResponse = await request.get(`${API_URL}/api/spaces`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
  });
  expect(spacesResponse.ok()).toBeTruthy();
  const spacesBody = (await spacesResponse.json()) as { spaces: Array<{ id: string; key: string }> };
  expect(spacesBody.spaces.length).toBeGreaterThan(0);
  const space = spacesBody.spaces[0];

  const stamp = Date.now().toString(36);
  const templateTitle = `Template Plan ${stamp}`;
  const uniqueTerm = `template_payload_${stamp}`;

  const createTemplate = await request.post(`${API_URL}/api/pages`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: {
      spaceId: space.id,
      title: templateTitle,
      parentId: null,
      isTemplate: true,
    },
  });
  expect(createTemplate.ok()).toBeTruthy();
  const templateBody = (await createTemplate.json()) as { page: { id: string } };

  const saveTemplate = await request.put(`${API_URL}/api/content/${templateBody.page.id}`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: {
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: `Kickoff checklist ${uniqueTerm}` }],
          },
        ],
      },
    },
  });
  expect(saveTemplate.ok()).toBeTruthy();

  await uiLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto('/search');

  await page.getByTestId('template-select').selectOption(templateBody.page.id);
  await page.getByTestId('create-from-template').click();

  await expect(page).toHaveURL(/\/space\/.+\/pages\/.+\?edit=1/);
  const createdUrl = page.url();
  const slugPart = createdUrl.split('/pages/')[1]?.split('?')[0] ?? '';
  const createdPageId = slugPart.split('-')[0];
  expect(createdPageId).toBeTruthy();

  const pageDetails = await request.get(`${API_URL}/api/pages/${createdPageId}`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
  });
  expect(pageDetails.ok()).toBeTruthy();
  const pageDetailsBody = (await pageDetails.json()) as { page: { title: string } };
  expect(pageDetailsBody.page.title).toContain(templateTitle);

  const createdContent = await request.get(`${API_URL}/api/content/${createdPageId}`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
  });
  expect(createdContent.ok()).toBeTruthy();
  const contentBody = (await createdContent.json()) as { content: { contentText: string } };
  expect(contentBody.content.contentText).toContain(uniqueTerm);
});
