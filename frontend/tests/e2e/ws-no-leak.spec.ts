import { expect, test, type APIRequestContext } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';

const API_URL = 'http://127.0.0.1:3000';
const WS_URL = 'http://127.0.0.1:3000';
const ADMIN_EMAIL = 'admin@cnavluence.local';
const ADMIN_PASSWORD = 'admin1234';
const ALLOWED_EMAIL = 'allowed.wsleak@cnavluence.local';
const DENIED_EMAIL = 'denied.wsleak@cnavluence.local';
const USER_PASSWORD = 'user12345';

type LoginResult = {
  accessToken: string;
  user: { id: string };
};

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
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (response.ok) {
        return extractRefreshCookie(response.headers.get('set-cookie'));
      }
      lastError = new Error(`WS login failed: ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError;
}

async function setupRestrictedPage(request: APIRequestContext): Promise<{ pageId: string }> {
  const admin = await apiLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);
  const allowed = await ensureUser(request, ALLOWED_EMAIL, 'Allowed WS Leak', USER_PASSWORD);
  const denied = await ensureUser(request, DENIED_EMAIL, 'Denied WS Leak', USER_PASSWORD);

  const spacesResponse = await request.get(`${API_URL}/api/spaces`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
  });
  expect(spacesResponse.ok()).toBeTruthy();
  const spacesBody = (await spacesResponse.json()) as { spaces: Array<{ id: string }> };
  const spaceId = spacesBody.spaces[0].id;

  for (const userId of [allowed.user.id, denied.user.id]) {
    const membership = await request.put(`${API_URL}/api/spaces/${spaceId}/members/${userId}`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
      data: { role: 'SPACE_EDITOR' },
    });
    expect(membership.ok()).toBeTruthy();
  }

  const createPage = await request.post(`${API_URL}/api/pages`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: { spaceId, title: `WS Leak ${Date.now().toString(36)}`, parentId: null },
  });
  expect(createPage.ok()).toBeTruthy();
  const pageBody = (await createPage.json()) as { page: { id: string } };
  const pageId = pageBody.page.id;

  const restrict = await request.put(`${API_URL}/api/pages/${pageId}/restrictions`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: {
      view: { userEmails: [ALLOWED_EMAIL], roles: [] },
      edit: { userEmails: [ALLOWED_EMAIL], roles: [] },
    },
  });
  expect(restrict.ok()).toBeTruthy();

  return { pageId };
}

function connectSocket(cookie: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket: Socket = io(WS_URL, {
      path: '/ws',
      transports: ['websocket'],
      forceNew: true,
      extraHeaders: {
        Cookie: cookie,
      },
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Timed out waiting for websocket connection'));
    }, 8000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      resolve(socket);
    });

    socket.on('connect_error', (error) => {
      clearTimeout(timeout);
      socket.disconnect();
      reject(error);
    });
  });
}

test('websocket does not leak restricted room events to denied user', async ({ request }) => {
  const setup = await setupRestrictedPage(request);
  const allowedCookie = await wsCookieLogin(ALLOWED_EMAIL, USER_PASSWORD);
  const deniedCookie = await wsCookieLogin(DENIED_EMAIL, USER_PASSWORD);

  const deniedSocket = await connectSocket(deniedCookie);
  const allowedSocketA = await connectSocket(allowedCookie);
  const allowedSocketB = await connectSocket(allowedCookie);

  const deniedEvents: string[] = [];
  deniedSocket.on('room-state', () => deniedEvents.push('room-state'));
  deniedSocket.on('presence', () => deniedEvents.push('presence'));
  deniedSocket.on('remote-update', () => deniedEvents.push('remote-update'));
  deniedSocket.on('awareness-update', () => deniedEvents.push('awareness-update'));

  try {
    const denialMessage = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for denial')), 8000);
      deniedSocket.once('error-event', (payload: { message?: string }) => {
        clearTimeout(timeout);
        resolve(payload?.message ?? '');
      });
      deniedSocket.emit('join-page', { pageId: setup.pageId });
    });
    expect(denialMessage).toBe('No view access');

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting room-state A')), 8000);
      allowedSocketA.once('room-state', () => {
        clearTimeout(timeout);
        resolve();
      });
      allowedSocketA.emit('join-page', { pageId: setup.pageId });
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting room-state B')), 8000);
      allowedSocketB.once('room-state', () => {
        clearTimeout(timeout);
        resolve();
      });
      allowedSocketB.emit('join-page', { pageId: setup.pageId });
    });

    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(deniedEvents).toHaveLength(0);
  } finally {
    deniedSocket.disconnect();
    allowedSocketA.disconnect();
    allowedSocketB.disconnect();
  }
});
