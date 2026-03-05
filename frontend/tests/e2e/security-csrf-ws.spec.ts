import { expect, test } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';

const API_URL = 'http://127.0.0.1:3000';
const WS_URL = 'http://127.0.0.1:3000';
const ADMIN_EMAIL = 'admin@cnavluence.local';
const ADMIN_PASSWORD = 'admin1234';

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

async function loginForRefreshCookie(): Promise<string> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        }),
      });
      if (response.ok) {
        return extractRefreshCookie(response.headers.get('set-cookie'));
      }
      lastError = new Error(`Login failed: ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError;
}

test('csrf checks are enforced for refresh and logout', async ({ request }) => {
  const refreshCookie = await loginForRefreshCookie();

  const missingOrigin = await request.post(`${API_URL}/api/auth/refresh`, {
    headers: { Cookie: refreshCookie },
  });
  expect(missingOrigin.status()).toBe(403);

  const badReferer = await request.post(`${API_URL}/api/auth/refresh`, {
    headers: {
      Cookie: refreshCookie,
      Referer: 'https://evil.example/path',
    },
  });
  expect(badReferer.status()).toBe(403);

  const sameOrigin = await request.post(`${API_URL}/api/auth/refresh`, {
    headers: {
      Cookie: refreshCookie,
      Origin: 'http://localhost:5173',
    },
  });
  expect(sameOrigin.status()).toBe(200);

  const badLogoutReferer = await request.post(`${API_URL}/api/auth/logout`, {
    headers: {
      Cookie: refreshCookie,
      Referer: 'https://evil.example/path',
    },
  });
  expect(badLogoutReferer.status()).toBe(403);
});

test('websocket connection without refresh cookie is rejected', async () => {
  const socket: Socket = io(WS_URL, {
    path: '/ws',
    transports: ['websocket'],
    forceNew: true,
  });

  const message = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Timed out waiting for websocket auth rejection'));
    }, 8000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.disconnect();
      reject(new Error('Socket unexpectedly connected without refresh cookie'));
    });

    socket.on('connect_error', (error: Error) => {
      clearTimeout(timeout);
      socket.disconnect();
      resolve(error.message);
    });
  });

  expect(message).toContain('Unauthorized');
});
