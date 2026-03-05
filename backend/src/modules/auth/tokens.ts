import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { env } from '../../config/env.js';

export type AccessTokenPayload = {
  sub: string;
  email: string;
};

export type RefreshTokenPayload = {
  sub: string;
  tokenVersion: number;
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: `${env.ACCESS_TOKEN_TTL_MIN}m`,
  });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(env.REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.REFRESH_COOKIE_SECURE,
    sameSite: env.REFRESH_COOKIE_SAMESITE,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: env.REFRESH_COOKIE_PATH,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(env.REFRESH_COOKIE_NAME, {
    path: env.REFRESH_COOKIE_PATH,
  });
}
