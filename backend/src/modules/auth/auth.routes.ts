import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import createHttpError from 'http-errors';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { clearRefreshCookie, setRefreshCookie, signAccessToken, signRefreshToken, verifyRefreshToken } from './tokens.js';
import { env } from '../../config/env.js';
import { requireAuth } from './auth-middleware.js';
import { ensurePersonalSpaceForUser } from '../spaces/personal-space.service.js';

const registerSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(120),
  password: z.string().min(8).max(255),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(255),
});

const oidcCallbackSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1),
  subject: z.string().min(1),
  emailVerified: z.boolean().default(true),
});

const oidcStartSchema = z.object({
  returnTo: z.string().optional(),
});

const oidcQueryCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

const oidcStateCookieName = 'cnav_oidc_state';
const oidcReturnToCookieName = 'cnav_oidc_return_to';

const oidcDiscoverySchema = z.object({
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  userinfo_endpoint: z.string().url(),
});

const oidcTokenSchema = z.object({
  access_token: z.string().min(1),
});

const oidcUserinfoSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  preferred_username: z.string().optional(),
});

type OidcRequestOptions = {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
};

export const authRouter = Router();

let cachedOidcCa: { path: string; value: Buffer } | null = null;

function getOidcCaCertificate(): Buffer | undefined {
  const certPath = env.OIDC_CA_CERT_PATH?.trim();
  if (!certPath) {
    return undefined;
  }

  if (cachedOidcCa?.path === certPath) {
    return cachedOidcCa.value;
  }

  try {
    const certificate = fs.readFileSync(certPath);
    cachedOidcCa = { path: certPath, value: certificate };
    return certificate;
  } catch {
    throw createHttpError(500, 'OIDC CA certificate path is invalid');
  }
}

async function oidcRequestJson(url: string, options: OidcRequestOptions = {}) {
  const target = new URL(url);
  const isHttps = target.protocol === 'https:';
  const transport = isHttps ? https : http;
  const tlsOptions =
    isHttps
      ? {
          ca: getOidcCaCertificate(),
          rejectUnauthorized: !env.OIDC_TLS_INSECURE,
        }
      : {};

  const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const request = transport.request(
      target,
      {
        method: options.method ?? 'GET',
        headers: options.headers,
        ...tlsOptions,
      },
      (result) => {
        const chunks: string[] = [];
        result.setEncoding('utf8');
        result.on('data', (chunk) => chunks.push(chunk));
        result.on('end', () => {
          resolve({
            statusCode: result.statusCode ?? 500,
            body: chunks.join(''),
          });
        });
      },
    );

    request.on('error', reject);
    if (options.body) {
      request.write(options.body);
    }
    request.end();
  }).catch(() => {
    throw createHttpError(502, 'OIDC upstream request failed');
  });

  let data: unknown = null;
  if (response.body.trim()) {
    try {
      data = JSON.parse(response.body);
    } catch {
      throw createHttpError(502, 'OIDC upstream returned invalid JSON');
    }
  }

  return {
    ok: response.statusCode >= 200 && response.statusCode < 300,
    status: response.statusCode,
    data,
  };
}

function normalizeReturnTo(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const appUrl = new URL(env.APP_URL);
    const sameOrigin = parsed.protocol === appUrl.protocol && parsed.host === appUrl.host;
    if (!sameOrigin) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function ensureSameOriginForCookieMutation(req: { header(name: string): string | undefined }): void {
  const origin = req.header('origin');
  const referer = req.header('referer');

  if (!origin && !referer) {
    throw createHttpError(403, 'Missing CSRF headers');
  }

  const appUrl = new URL(env.APP_URL);
  const appOrigin = `${appUrl.protocol}//${appUrl.host}`;

  if (origin && origin !== appOrigin) {
    throw createHttpError(403, 'Invalid origin');
  }

  if (referer) {
    let refererOrigin = '';
    try {
      const refererUrl = new URL(referer);
      refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
    } catch {
      throw createHttpError(403, 'Invalid referer');
    }
    if (refererOrigin !== appOrigin) {
      throw createHttpError(403, 'Invalid referer');
    }
  }
}

function issueSession(res: Parameters<typeof setRefreshCookie>[0], user: { id: string; email: string; displayName: string; siteRole: unknown }) {
  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refreshToken = signRefreshToken({ sub: user.id, tokenVersion: 1 });
  setRefreshCookie(res, refreshToken);

  return {
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      siteRole: user.siteRole,
    },
  };
}

async function linkOrCreateOidcUser(profile: { email: string; displayName: string; subject: string }) {
  const normalizedEmail = profile.email.trim().toLowerCase();

  const identity = await prisma.authIdentity.findUnique({
    where: {
      provider_subject: {
        provider: 'OIDC',
        subject: profile.subject,
      },
    },
    include: { user: true },
  });

  if (identity?.user) {
    return identity.user;
  }

  const existingUser = await prisma.user.findUnique({ where: { normalizedEmail } });
  if (existingUser) {
    return prisma.user.update({
      where: { id: existingUser.id },
      data: {
        identities: {
          create: {
            provider: 'OIDC',
            subject: profile.subject,
          },
        },
      },
    });
  }

  return prisma.user.create({
    data: {
      email: profile.email,
      normalizedEmail,
      displayName: profile.displayName,
      identities: {
        create: {
          provider: 'OIDC',
          subject: profile.subject,
        },
      },
    },
  });
}

async function resolveOidcEndpoints() {
  if (env.OIDC_AUTHORIZATION_ENDPOINT && env.OIDC_TOKEN_ENDPOINT && env.OIDC_USERINFO_ENDPOINT) {
    return {
      authorizationEndpoint: env.OIDC_AUTHORIZATION_ENDPOINT,
      tokenEndpoint: env.OIDC_TOKEN_ENDPOINT,
      userinfoEndpoint: env.OIDC_USERINFO_ENDPOINT,
    };
  }

  if (!env.OIDC_ISSUER) {
    throw createHttpError(500, 'OIDC issuer is not configured');
  }

  const issuer = env.OIDC_ISSUER.replace(/\/$/, '');
  const discoveryUrl = `${issuer}/.well-known/openid-configuration`;
  const discoveryResponse = await oidcRequestJson(discoveryUrl);
  if (!discoveryResponse.ok) {
    throw createHttpError(502, 'Unable to resolve OIDC discovery document');
  }

  const discovery = oidcDiscoverySchema.parse(discoveryResponse.data);
  return {
    authorizationEndpoint: discovery.authorization_endpoint,
    tokenEndpoint: discovery.token_endpoint,
    userinfoEndpoint: discovery.userinfo_endpoint,
  };
}

authRouter.get('/config', (_req, res) => {
  res.json({
    authProvider: env.AUTH_PROVIDER,
    oidcTransparentLogin: env.OIDC_TRANSPARENT_LOGIN,
    oidcEnabled: env.OIDC_ENABLED,
  });
});

authRouter.post('/register', async (req, res) => {
  const payload = registerSchema.parse(req.body);
  const normalizedEmail = payload.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { normalizedEmail } });
  if (existing) {
    throw createHttpError(409, 'Email already exists');
  }

  const passwordHash = await bcrypt.hash(payload.password, 10);
  const user = await prisma.user.create({
    data: {
      email: payload.email,
      normalizedEmail,
      displayName: payload.displayName,
      passwordHash,
      identities: {
        create: {
          provider: 'LOCAL',
          subject: normalizedEmail,
        },
      },
    },
  });

  await ensurePersonalSpaceForUser(user.id);
  const session = issueSession(res, user);
  res.status(201).json(session);
});

authRouter.post('/login', async (req, res) => {
  const payload = loginSchema.parse(req.body);
  const normalizedEmail = payload.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { normalizedEmail },
  });

  if (!user?.passwordHash) {
    throw createHttpError(401, 'Invalid credentials');
  }

  const ok = await bcrypt.compare(payload.password, user.passwordHash);
  if (!ok) {
    throw createHttpError(401, 'Invalid credentials');
  }

  await ensurePersonalSpaceForUser(user.id);
  const session = issueSession(res, user);
  res.json(session);
});

authRouter.get('/oidc/start', async (req, res) => {
  if (!env.OIDC_ENABLED) {
    throw createHttpError(400, 'OIDC disabled');
  }

  if (!env.OIDC_CLIENT_ID || !env.OIDC_CLIENT_SECRET || !env.OIDC_REDIRECT_URI) {
    throw createHttpError(500, 'OIDC client settings are incomplete');
  }

  const query = oidcStartSchema.parse(req.query);
  const state = crypto.randomBytes(24).toString('hex');
  const { authorizationEndpoint } = await resolveOidcEndpoints();

  const authorizationUrl = new URL(authorizationEndpoint);
  authorizationUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: env.OIDC_CLIENT_ID,
    redirect_uri: env.OIDC_REDIRECT_URI,
    scope: env.OIDC_SCOPE,
    state,
  }).toString();

  res.cookie(oidcStateCookieName, state, {
    httpOnly: true,
    secure: env.REFRESH_COOKIE_SECURE,
    sameSite: env.REFRESH_COOKIE_SAMESITE,
    maxAge: 10 * 60 * 1000,
    path: '/api/auth/oidc',
  });

  if (query.returnTo) {
    const normalizedReturnTo = normalizeReturnTo(query.returnTo);
    if (!normalizedReturnTo) {
      throw createHttpError(400, 'Invalid returnTo');
    }

    res.cookie(oidcReturnToCookieName, normalizedReturnTo, {
      httpOnly: true,
      secure: env.REFRESH_COOKIE_SECURE,
      sameSite: env.REFRESH_COOKIE_SAMESITE,
      maxAge: 10 * 60 * 1000,
      path: '/api/auth/oidc',
    });
  }

  res.json({ authorizationUrl: authorizationUrl.toString() });
});

authRouter.get('/oidc/callback', async (req, res) => {
  if (!env.OIDC_ENABLED) {
    throw createHttpError(400, 'OIDC disabled');
  }

  if (!env.OIDC_CLIENT_ID || !env.OIDC_CLIENT_SECRET || !env.OIDC_REDIRECT_URI) {
    throw createHttpError(500, 'OIDC client settings are incomplete');
  }

  const payload = oidcQueryCallbackSchema.parse(req.query);
  const expectedState = req.cookies[oidcStateCookieName] as string | undefined;
  res.clearCookie(oidcStateCookieName, { path: '/api/auth/oidc' });

  if (!expectedState || expectedState !== payload.state) {
    throw createHttpError(400, 'Invalid OIDC state');
  }

  const { tokenEndpoint, userinfoEndpoint } = await resolveOidcEndpoints();

  const tokenResponse = await oidcRequestJson(tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: payload.code,
      redirect_uri: env.OIDC_REDIRECT_URI,
      client_id: env.OIDC_CLIENT_ID,
      client_secret: env.OIDC_CLIENT_SECRET,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    throw createHttpError(401, 'OIDC token exchange failed');
  }

  const token = oidcTokenSchema.parse(tokenResponse.data);

  const userinfoResponse = await oidcRequestJson(userinfoEndpoint, {
    headers: {
      authorization: `Bearer ${token.access_token}`,
    },
  });

  if (!userinfoResponse.ok) {
    throw createHttpError(401, 'OIDC userinfo lookup failed');
  }

  const userinfo = oidcUserinfoSchema.parse(userinfoResponse.data);

  if (env.OIDC_REQUIRE_EMAIL_VERIFIED && userinfo.email_verified === false) {
    throw createHttpError(403, 'OIDC email is not verified');
  }

  const user = await linkOrCreateOidcUser({
    email: userinfo.email,
    displayName: userinfo.name ?? userinfo.preferred_username ?? userinfo.email,
    subject: userinfo.sub,
  });

  await ensurePersonalSpaceForUser(user.id);
  const session = issueSession(res, user);
  const returnToCookie = req.cookies[oidcReturnToCookieName] as string | undefined;
  res.clearCookie(oidcReturnToCookieName, { path: '/api/auth/oidc' });
  const returnTo = returnToCookie ? normalizeReturnTo(returnToCookie) : null;

  if (returnTo) {
    const separator = returnTo.includes('?') ? '&' : '?';
    const redirectUrl = `${returnTo}${separator}accessToken=${encodeURIComponent(session.accessToken)}`;
    res.redirect(302, redirectUrl);
    return;
  }

  res.json(session);
});

authRouter.post('/oidc/callback', async (req, res) => {
  if (!env.OIDC_ENABLED) {
    throw createHttpError(400, 'OIDC disabled');
  }

  const payload = oidcCallbackSchema.parse(req.body);

  if (env.OIDC_REQUIRE_EMAIL_VERIFIED && !payload.emailVerified) {
    throw createHttpError(403, 'OIDC email is not verified');
  }

  const user = await linkOrCreateOidcUser({
    email: payload.email,
    displayName: payload.displayName,
    subject: payload.subject,
  });
  await ensurePersonalSpaceForUser(user.id);
  const session = issueSession(res, user);
  res.json(session);
});

authRouter.post('/refresh', async (req, res) => {
  ensureSameOriginForCookieMutation(req);

  const cookie = req.cookies[env.REFRESH_COOKIE_NAME] as string | undefined;
  if (!cookie) {
    throw createHttpError(401, 'Missing refresh token');
  }

  const payload = verifyRefreshToken(cookie);
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw createHttpError(401, 'User not found');
  }

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refreshToken = signRefreshToken({ sub: user.id, tokenVersion: payload.tokenVersion + 1 });
  setRefreshCookie(res, refreshToken);

  res.json({ accessToken });
});

authRouter.post('/logout', (_req, res) => {
  ensureSameOriginForCookieMutation(_req);
  clearRefreshCookie(res);
  res.status(204).send();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      status: true,
      siteRole: true,
    },
  });

  if (!user) {
    throw createHttpError(404, 'User not found');
  }

  res.json({ user });
});
