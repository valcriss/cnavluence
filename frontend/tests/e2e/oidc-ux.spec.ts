import { expect, test } from '@playwright/test';

test('login shows user-friendly message when SSO is disabled', async ({ page }) => {
  await page.route('**/api/auth/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authProvider: 'local', oidcTransparentLogin: true, oidcEnabled: false }),
    });
  });

  await page.route('**/api/auth/oidc/start**', async (route) => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'OIDC disabled' }),
    });
  });

  await page.goto('/login');
  await page.getByTestId('sso-login').click();
  await expect(page.getByText('SSO is not configured for this environment.')).toBeVisible();
});

test('login starts SSO by redirecting to authorization URL', async ({ page }) => {
  await page.route('**/api/auth/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authProvider: 'local', oidcTransparentLogin: true, oidcEnabled: true }),
    });
  });

  await page.route('**/api/auth/oidc/start**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authorizationUrl: 'http://localhost:5173/login?sso=1' }),
    });
  });

  await page.goto('/login');
  await page.getByTestId('sso-login').click();
  await expect(page).toHaveURL(/\/login\?sso=1/);
});

test('login transparently starts SSO when auth provider is oidc', async ({ page }) => {
  await page.route('**/api/auth/config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authProvider: 'oidc', oidcTransparentLogin: true, oidcEnabled: true }),
    });
  });

  await page.route('**/api/auth/oidc/start**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ authorizationUrl: 'http://localhost:5173/login?sso=1' }),
    });
  });

  await page.goto('/login');
  await expect(page).toHaveURL(/\/login\?sso=1/);
});

test('oidc callback displays explicit provider error details', async ({ page }) => {
  await page.goto('/auth/oidc/callback?error=access_denied&error_description=User%20cancelled');
  await expect(page.getByText('SSO callback error (access_denied): User cancelled')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to login' })).toBeVisible();
});
