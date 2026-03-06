import express from 'express';
import cookieParser from 'cookie-parser';
import 'express-async-errors';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorMiddleware } from '../../src/lib/error-middleware.js';

const mockedPrisma = {
  authIdentity: {
    findUnique: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: mockedPrisma,
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    APP_URL: 'http://localhost:5173',
    AUTH_PROVIDER: 'oidc',
    OIDC_ENABLED: true,
    OIDC_TRANSPARENT_LOGIN: true,
    OIDC_CLIENT_ID: 'client',
    OIDC_CLIENT_SECRET: 'secret',
    OIDC_REDIRECT_URI: 'http://localhost:3000/api/auth/oidc/callback',
    OIDC_SCOPE: 'openid profile email',
    OIDC_AUTHORIZATION_ENDPOINT: 'https://issuer.example/authorize',
    OIDC_TOKEN_ENDPOINT: 'https://issuer.example/token',
    OIDC_USERINFO_ENDPOINT: 'https://issuer.example/userinfo',
    OIDC_CA_CERT_PATH: undefined,
    OIDC_TLS_INSECURE: false,
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
  signRefreshToken: vi.fn(() => 'refresh.token'),
  verifyRefreshToken: vi.fn(() => ({ sub: 'user_1', tokenVersion: 1 })),
  setRefreshCookie: vi.fn((res: express.Response, token: string) => {
    res.cookie('cnav_refresh', token, { httpOnly: true, path: '/' });
  }),
  clearRefreshCookie: vi.fn((res: express.Response) => {
    res.clearCookie('cnav_refresh', { path: '/' });
  }),
}));

describe('auth oidc flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unsafe returnTo in oidc start', async () => {
    const { authRouter } = await import('../../src/modules/auth/auth.routes.js');
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', authRouter);
    app.use(errorMiddleware);

    const response = await request(app).get('/api/auth/oidc/start').query({
      returnTo: 'https://evil.example/callback',
    });

    expect(response.status).toBe(400);
  });

  it('returns auth provider config for login UX', async () => {
    const { authRouter } = await import('../../src/modules/auth/auth.routes.js');
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', authRouter);
    app.use(errorMiddleware);

    const response = await request(app).get('/api/auth/config');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      authProvider: 'oidc',
      oidcTransparentLogin: true,
      oidcEnabled: true,
    });
  });

  it('accepts same-origin absolute returnTo and normalizes cookie path', async () => {
    const { authRouter } = await import('../../src/modules/auth/auth.routes.js');
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', authRouter);
    app.use(errorMiddleware);

    const response = await request(app).get('/api/auth/oidc/start').query({
      returnTo: 'http://localhost:5173/search?scope=all',
    });

    expect(response.status).toBe(200);
    expect(response.body.authorizationUrl).toContain('https://issuer.example/authorize');
    const setCookie = response.headers['set-cookie'] as string[] | undefined;
    expect(setCookie?.some((value) => value.includes('cnav_oidc_return_to=%2Fsearch%3Fscope%3Dall'))).toBeTruthy();
  });

  it('links oidc login to existing local account by normalized email', async () => {
    mockedPrisma.authIdentity.findUnique.mockResolvedValue(null);
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 'user_existing',
      email: 'owner@example.test',
      normalizedEmail: 'owner@example.test',
      displayName: 'Owner',
      siteRole: 'SITE_USER',
    });
    mockedPrisma.user.update.mockResolvedValue({
      id: 'user_existing',
      email: 'owner@example.test',
      normalizedEmail: 'owner@example.test',
      displayName: 'Owner',
      siteRole: 'SITE_USER',
    });

    const { authRouter } = await import('../../src/modules/auth/auth.routes.js');
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', authRouter);
    app.use(errorMiddleware);

    const response = await request(app).post('/api/auth/oidc/callback').send({
      email: 'OWNER@EXAMPLE.TEST',
      displayName: 'Owner OIDC',
      subject: 'oidc-subject-1',
      emailVerified: true,
    });

    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe('user_existing');
    expect(mockedPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user_existing' },
      }),
    );
    expect(mockedPrisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects unverified oidc email when verification is required', async () => {
    const { authRouter } = await import('../../src/modules/auth/auth.routes.js');
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/auth', authRouter);
    app.use(errorMiddleware);

    const response = await request(app).post('/api/auth/oidc/callback').send({
      email: 'user@example.test',
      displayName: 'User',
      subject: 'oidc-subject-2',
      emailVerified: false,
    });

    expect(response.status).toBe(403);
  });
});
