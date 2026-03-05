import { expect, test, type APIRequestContext } from '@playwright/test';

const API_URL = 'http://127.0.0.1:3000';
const ADMIN_EMAIL = 'admin@cnavluence.local';
const ADMIN_PASSWORD = 'admin1234';

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

async function createPageForVersions(request: APIRequestContext, token: string) {
  const spacesResponse = await request.get(`${API_URL}/api/spaces`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(spacesResponse.ok()).toBeTruthy();
  const spacesBody = (await spacesResponse.json()) as { spaces: Array<{ id: string }> };
  expect(spacesBody.spaces.length).toBeGreaterThan(0);
  const spaceId = spacesBody.spaces[0].id;

  const stamp = Date.now().toString(36);
  const createPage = await request.post(`${API_URL}/api/pages`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      spaceId,
      title: `Versions ${stamp}`,
      parentId: null,
    },
  });
  expect(createPage.ok()).toBeTruthy();
  const pageBody = (await createPage.json()) as { page: { id: string } };
  return pageBody.page.id;
}

async function saveTextContent(request: APIRequestContext, token: string, pageId: string, text: string) {
  const response = await request.put(`${API_URL}/api/content/${pageId}`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      },
    },
  });
  expect(response.ok()).toBeTruthy();
}

test('restore is blocked while editors are active, then succeeds and creates RESTORE version', async ({ request }) => {
  const admin = await apiLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);
  const pageId = await createPageForVersions(request, admin.accessToken);

  await saveTextContent(request, admin.accessToken, pageId, 'baseline_v1');
  const manualV1 = await request.post(`${API_URL}/api/versions/manual`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: { pageId },
  });
  expect(manualV1.ok()).toBeTruthy();
  const manualV1Body = (await manualV1.json()) as { version: { id: string } };

  await saveTextContent(request, admin.accessToken, pageId, 'changed_v2');
  const manualV2 = await request.post(`${API_URL}/api/versions/manual`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: { pageId },
  });
  expect(manualV2.ok()).toBeTruthy();

  const enterSession = await request.post(`${API_URL}/api/content/session/enter`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: { pageId },
  });
  expect(enterSession.ok()).toBeTruthy();

  const blockedRestore = await request.post(`${API_URL}/api/versions/restore`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: { versionId: manualV1Body.version.id },
  });
  expect(blockedRestore.status()).toBe(409);

  const leaveSession = await request.post(`${API_URL}/api/content/session/leave`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: { pageId },
  });
  expect(leaveSession.status()).toBe(204);

  const restore = await request.post(`${API_URL}/api/versions/restore`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: { versionId: manualV1Body.version.id },
  });
  expect(restore.status()).toBe(204);

  const contentResponse = await request.get(`${API_URL}/api/content/${pageId}`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
  });
  expect(contentResponse.ok()).toBeTruthy();
  const contentBody = (await contentResponse.json()) as { content: { contentText: string } };
  expect(contentBody.content.contentText).toContain('baseline_v1');
  expect(contentBody.content.contentText).not.toContain('changed_v2');

  const versionsResponse = await request.get(`${API_URL}/api/versions/${pageId}`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
  });
  expect(versionsResponse.ok()).toBeTruthy();
  const versionsBody = (await versionsResponse.json()) as {
    versions: Array<{ reason: string; restoredFromId?: string | null }>;
  };
  const latest = versionsBody.versions[0];
  expect(latest.reason).toBe('RESTORE');
  expect(latest.restoredFromId).toBe(manualV1Body.version.id);
});
