import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

const ADMIN_EMAIL = 'admin@cnavluence.local';
const ADMIN_PASSWORD = 'admin1234';
const EDITOR_EMAIL = 'editor.e2e@cnavluence.local';
const EDITOR_PASSWORD = 'editor1234';
const EDITOR_NAME = 'Editor E2E';

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/search/);
}

async function apiLogin(request: APIRequestContext, email: string, password: string) {
  const response = await request.post('http://localhost:3000/api/auth/login', {
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{ accessToken: string; user: { id: string } }>;
}

async function ensureEditorMembership(request: APIRequestContext) {
  const register = await request.post('http://localhost:3000/api/auth/register', {
    data: { email: EDITOR_EMAIL, displayName: EDITOR_NAME, password: EDITOR_PASSWORD },
  });

  let editorUserId = '';
  if (register.ok()) {
    const body = (await register.json()) as { user: { id: string } };
    editorUserId = body.user.id;
  } else {
    const loginBody = await apiLogin(request, EDITOR_EMAIL, EDITOR_PASSWORD);
    editorUserId = loginBody.user.id;
  }

  const admin = await apiLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);
  const spacesResponse = await request.get('http://localhost:3000/api/spaces', {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
  });
  expect(spacesResponse.ok()).toBeTruthy();
  const spacesBody = (await spacesResponse.json()) as { spaces: Array<{ id: string }> };
  expect(spacesBody.spaces.length).toBeGreaterThan(0);

  const spaceId = spacesBody.spaces[0].id;
  const membership = await request.put(`http://localhost:3000/api/spaces/${spaceId}/members/${editorUserId}`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: { role: 'SPACE_EDITOR' },
  });
  expect(membership.ok()).toBeTruthy();
}

test('multi-session collab syncs content, shows cursors, and keeps persisted manual version', async ({ browser, request }) => {
  await ensureEditorMembership(request);

  const adminContext = await browser.newContext();
  const editorContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const editorPage = await editorContext.newPage();

  await login(adminPage, ADMIN_EMAIL, ADMIN_PASSWORD);
  await adminPage.getByRole('button', { name: 'Ajouter un document' }).click();
  await expect(adminPage).toHaveURL(/\/space\/.+\/pages\/.+\?edit=1/);
  const pageUrl = `${adminPage.url().split('?')[0]}?edit=1`;

  await login(editorPage, EDITOR_EMAIL, EDITOR_PASSWORD);
  await editorPage.goto(pageUrl);
  if (await editorPage.getByRole('button', { name: 'Edit' }).isVisible()) {
    await editorPage.getByRole('button', { name: 'Edit' }).click();
  }

  const adminEditor = adminPage.locator('.tiptap.ProseMirror').first();
  const editorEditor = editorPage.locator('.tiptap.ProseMirror').first();
  await expect(editorEditor).toHaveAttribute('contenteditable', 'true', { timeout: 15000 });

  await adminEditor.click();
  await adminPage.keyboard.type('First editor line');
  await expect(editorEditor).toContainText('First editor line', { timeout: 15000 });

  await editorEditor.click();
  await editorPage.keyboard.press('ArrowRight');
  await expect(adminPage.locator('.collaboration-cursor__label', { hasText: EDITOR_NAME }).first()).toBeVisible({
    timeout: 15000,
  });

  await adminPage.locator('button', { hasText: 'Publish changes' }).click();
  await adminPage.reload();
  await expect(adminEditor).toContainText('First editor line');

  await adminPage.locator('.toolbar .fa-clock').first().locator('..').click();
  await adminPage.getByRole('button', { name: 'Create version now' }).click();
  await expect(adminPage.getByText('MANUAL')).toBeVisible();

  await adminContext.close();
  await editorContext.close();
});
