import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';

const ADMIN_EMAIL = 'admin@cnavluence.local';
const ADMIN_PASSWORD = 'admin1234';
const ALLOWED_EMAIL = 'allowed.restrictions@cnavluence.local';
const DENIED_EMAIL = 'denied.restrictions@cnavluence.local';
const USER_PASSWORD = 'user12345';
const API_URL = 'http://127.0.0.1:3000';
const WS_URL = 'http://127.0.0.1:3000';

type LoginResult = {
  accessToken: string;
  user: { id: string; email: string; displayName: string };
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

async function ensureUser(
  request: APIRequestContext,
  email: string,
  displayName: string,
  password: string,
): Promise<LoginResult> {
  const register = await request.post(`${API_URL}/api/auth/register`, {
    data: { email, displayName, password },
  });

  if (register.ok()) {
    return (await register.json()) as LoginResult;
  }

  return apiLogin(request, email, password);
}

async function setupRestrictedPage(
  request: APIRequestContext,
  policy?: {
    viewUserEmails?: string[];
    editUserEmails?: string[];
  },
) {
  const admin = await apiLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);
  const allowed = await ensureUser(request, ALLOWED_EMAIL, 'Allowed Restrictions', USER_PASSWORD);
  const denied = await ensureUser(request, DENIED_EMAIL, 'Denied Restrictions', USER_PASSWORD);

  const spacesResponse = await request.get(`${API_URL}/api/spaces`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
  });
  expect(spacesResponse.ok()).toBeTruthy();
  const spacesBody = (await spacesResponse.json()) as { spaces: Array<{ id: string; key: string }> };
  expect(spacesBody.spaces.length).toBeGreaterThan(0);
  const space = spacesBody.spaces[0];

  for (const userId of [allowed.user.id, denied.user.id]) {
    const membership = await request.put(`${API_URL}/api/spaces/${space.id}/members/${userId}`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
      data: { role: 'SPACE_EDITOR' },
    });
    expect(membership.ok()).toBeTruthy();
  }

  const stamp = Date.now().toString(36);
  const title = `Restricted ${stamp}`;
  const uniqueTerm = `secret_${stamp}`;

  const createPage = await request.post(`${API_URL}/api/pages`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: { spaceId: space.id, title, parentId: null },
  });
  expect(createPage.ok()).toBeTruthy();
  const pageBody = (await createPage.json()) as { page: { id: string; slug: string } };
  const pageId = pageBody.page.id;

  const saveContent = await request.put(`${API_URL}/api/content/${pageId}`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: {
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: uniqueTerm }] }],
      },
    },
  });
  expect(saveContent.ok()).toBeTruthy();

  const upload = await request.post(`${API_URL}/api/attachments/upload`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    multipart: {
      spaceId: space.id,
      pageId,
      file: {
        name: `restricted-${stamp}.txt`,
        mimeType: 'text/plain',
        buffer: Buffer.from(`attachment_${uniqueTerm}`, 'utf-8'),
      },
    },
  });
  expect(upload.ok()).toBeTruthy();
  const uploadBody = (await upload.json()) as { attachment: { id: string } };

  const restrict = await request.put(`${API_URL}/api/pages/${pageId}/restrictions`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: {
      view: { userEmails: policy?.viewUserEmails ?? [ALLOWED_EMAIL], roles: [] },
      edit: { userEmails: policy?.editUserEmails ?? [ALLOWED_EMAIL], roles: [] },
    },
  });
  expect(restrict.ok()).toBeTruthy();

  return {
    spaceId: space.id,
    pageId,
    attachmentId: uploadBody.attachment.id,
    pageUrl: `http://localhost:5173/space/${space.key}/pages/${pageId}-${pageBody.page.slug}`,
    title,
    uniqueTerm,
    denied,
  };
}

function extractRefreshCookie(setCookieHeader: string | null): string {
  if (!setCookieHeader) {
    throw new Error('Missing set-cookie header');
  }

  const match = setCookieHeader.match(/(cnav_refresh=[^;]+)/);
  if (!match) {
    throw new Error(`Refresh cookie not found in header: ${setCookieHeader}`);
  }
  return match[1];
}

async function wsCookieLogin(email: string, password: string): Promise<string> {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`WS login failed: ${response.status}`);
  }
  return extractRefreshCookie(response.headers.get('set-cookie'));
}

test('restricted page is denied and hidden from search for non-allowed user', async ({ page, request }) => {
  const setup = await setupRestrictedPage(request);

  await uiLogin(page, DENIED_EMAIL, USER_PASSWORD);
  await page.goto(setup.pageUrl);
  await expect(page.getByText('Unable to load page')).toBeVisible();

  await page.goto('/search');
  await page.getByPlaceholder('Search titles and content').fill(setup.uniqueTerm);
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('heading', { level: 3, name: setup.title })).toHaveCount(0);
});

test('websocket join is rejected for non-allowed user', async ({ request }) => {
  const setup = await setupRestrictedPage(request);
  const cookie = await wsCookieLogin(DENIED_EMAIL, USER_PASSWORD);

  const socket: Socket = io(WS_URL, {
    path: '/ws',
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: {
      Cookie: cookie,
    },
  });

  const denied = await new Promise<string>((resolve, reject) => {
    const disconnectAnd = (done: () => void) => {
      socket.once('disconnect', done);
      socket.disconnect();
    };

    const timeout = setTimeout(() => {
      disconnectAnd(() => reject(new Error('Timed out waiting for ws denial')));
    }, 8000);

    socket.on('connect', () => {
      socket.emit('join-page', { pageId: setup.pageId });
    });

    socket.on('error-event', (payload: { message?: string }) => {
      clearTimeout(timeout);
      const message = payload?.message ?? 'unknown';
      disconnectAnd(() => resolve(message));
    });

    socket.on('connect_error', (error) => {
      clearTimeout(timeout);
      disconnectAnd(() => reject(error));
    });
  });

  expect(denied).toBe('No view access');
});

test('view-only user can open page but cannot enter edit mode or send ws edits', async ({ page, request }) => {
  const setup = await setupRestrictedPage(request, {
    viewUserEmails: [ALLOWED_EMAIL, DENIED_EMAIL],
    editUserEmails: [ALLOWED_EMAIL],
  });

  await uiLogin(page, DENIED_EMAIL, USER_PASSWORD);
  await page.goto(setup.pageUrl);
  await expect(page.getByRole('heading', { level: 1, name: setup.title })).toBeVisible();

  const editor = page.locator('.tiptap.ProseMirror').first();
  await expect(editor).toHaveAttribute('contenteditable', 'false');

  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
  await expect(editor).toHaveAttribute('contenteditable', 'false');

  const cookie = await wsCookieLogin(DENIED_EMAIL, USER_PASSWORD);
  const socket: Socket = io(WS_URL, {
    path: '/ws',
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: {
      Cookie: cookie,
    },
  });

  const denied = await new Promise<string>((resolve, reject) => {
    const disconnectAnd = (done: () => void) => {
      socket.once('disconnect', done);
      socket.disconnect();
    };

    const timeout = setTimeout(() => {
      disconnectAnd(() => reject(new Error('Timed out waiting for ws edit denial')));
    }, 8000);

    socket.on('connect', () => {
      socket.emit('join-page', { pageId: setup.pageId });
    });

    socket.on('room-state', () => {
      socket.emit('apply-update', {
        pageId: setup.pageId,
        update: 'AA==',
      });
    });

    socket.on('error-event', (payload: { message?: string }) => {
      if (payload?.message !== 'No edit access') {
        return;
      }
      clearTimeout(timeout);
      disconnectAnd(() => resolve(payload.message ?? 'unknown'));
    });

    socket.on('connect_error', (error) => {
      clearTimeout(timeout);
      disconnectAnd(() => reject(error));
    });
  });

  expect(denied).toBe('No edit access');
});

test('restricted page attachments are hidden from non-allowed user (list and download)', async ({ request }) => {
  const setup = await setupRestrictedPage(request);
  const deniedLogin = await apiLogin(request, DENIED_EMAIL, USER_PASSWORD);

  const list = await request.get(`${API_URL}/api/attachments`, {
    headers: { Authorization: `Bearer ${deniedLogin.accessToken}` },
    params: { spaceId: setup.spaceId, pageId: setup.pageId },
  });
  expect(list.status()).toBe(403);

  const download = await request.get(`${API_URL}/api/attachments/${setup.attachmentId}/download`, {
    headers: { Authorization: `Bearer ${deniedLogin.accessToken}` },
  });
  expect(download.status()).toBe(403);
});

test('audit logs scoped to restricted page are blocked for non-allowed user', async ({ request }) => {
  const setup = await setupRestrictedPage(request);
  const deniedLogin = await apiLogin(request, DENIED_EMAIL, USER_PASSWORD);

  const response = await request.get(`${API_URL}/api/audit`, {
    headers: { Authorization: `Bearer ${deniedLogin.accessToken}` },
    params: { pageId: setup.pageId },
  });

  expect(response.status()).toBe(403);
});
