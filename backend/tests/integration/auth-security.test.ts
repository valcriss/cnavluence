import express from 'express';
import cookieParser from 'cookie-parser';
import 'express-async-errors';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorMiddleware } from '../../src/lib/error-middleware.js';

const mockedPrisma = {
  user: {
    findUnique: vi.fn(),
  },
};

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: mockedPrisma,
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    APP_URL: 'http://localhost:5173',
    OIDC_ENABLED: true,
    OIDC_CLIENT_ID: 'client',
    OIDC_CLIENT_SECRET: 'secret',
    OIDC_REDIRECT_URI: 'http://localhost:3000/api/auth/oidc/callback',
    OIDC_SCOPE: 'openid profile email',
    OIDC_AUTHORIZATION_ENDPOINT: 'https://issuer.example/authorize',
    OIDC_TOKEN_ENDPOINT: 'https://issuer.example/token',
    OIDC_USERINFO_ENDPOINT: 'https://issuer.example/userinfo',
    OIDC_REQUIRE_EMAIL_VERIFIED: true,
    REFRESH_COOKIE_NAME: 'cnav_refresh',
    REFRESH_COOKIE_SECURE: false,
    REFRESH_COOKIE_SAMESITE: 'lax',
    REFRESH_COOKIE_PATH: '/',
    REFRESH_TOKEN_TTL_DAYS: 14,
    ACCESS_TOKEN_TTL_MIN: 15,
    JWT_ACCESS_SECRET: 'test-access-secret',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
  },
}));

vi.mock('../../src/modules/auth/tokens.js', () => ({
  signAccessToken: vi.fn(() => 'access.token'),
  signRefreshToken: vi.fn(() => 'refresh.next'),
  verifyRefreshToken: vi.fn(() => ({ sub: 'user_1', tokenVersion: 1 })),
  setRefreshCookie: vi.fn((res: express.Response, token: string) => {
    res.cookie('cnav_refresh', token, { httpOnly: true, path: '/' });
  }),
  clearRefreshCookie: vi.fn((res: express.Response) => {
    res.clearCookie('cnav_refresh', { path: '/' });
  }),
}));

const mockedEnsurePersonalSpaceForUser = vi.fn(async () => undefined);

vi.mock('../../src/modules/spaces/personal-space.service.js', () => ({
  ensurePersonalSpaceForUser: mockedEnsurePersonalSpaceForUser,
}));

describe('auth csrf protections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'user1@example.test',
      displayName: 'User One',
      siteRole: 'SITE_USER',
    });
    mockedEnsurePersonalSpaceForUser.mockResolvedValue(undefined);
  });

  it('rejects refresh without origin/referer headers', async () => {
    const { authRouter } = await import('../../src/modules/auth/auth.routes.js');
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', authRouter);
    app.use(errorMiddleware);

    const response = await request(app).post('/api/auth/refresh').set('Cookie', 'cnav_refresh=token');

    expect(response.status).toBe(403);
  });

  it('rejects refresh with foreign origin', async () => {
    const { authRouter } = await import('../../src/modules/auth/auth.routes.js');
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', authRouter);
    app.use(errorMiddleware);

    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', 'https://evil.example')
      .set('Cookie', 'cnav_refresh=token');

    expect(response.status).toBe(403);
  });

  it('accepts refresh with same-site origin and valid cookie', async () => {
    const { authRouter } = await import('../../src/modules/auth/auth.routes.js');
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', authRouter);
    app.use(errorMiddleware);

    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', 'cnav_refresh=token');

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBe('access.token');
    expect(mockedEnsurePersonalSpaceForUser).toHaveBeenCalledWith('user_1');
  });

  it('rejects logout with invalid referer', async () => {
    const { authRouter } = await import('../../src/modules/auth/auth.routes.js');
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', authRouter);
    app.use(errorMiddleware);

    const response = await request(app).post('/api/auth/logout').set('Referer', 'https://evil.example/path');

    expect(response.status).toBe(403);
  });
});
