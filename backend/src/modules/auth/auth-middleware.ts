import type { Request, Response, NextFunction } from 'express';
import createHttpError from 'http-errors';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { verifyAccessToken, verifyRefreshToken } from './tokens.js';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        email: string;
      };
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.header('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    throw createHttpError(401, 'Authentication required');
  }

  try {
    const payload = verifyAccessToken(token);
    req.auth = { userId: payload.sub, email: payload.email };
    next();
  } catch {
    throw createHttpError(401, 'Invalid access token');
  }
}

export async function requireAuthOrRefreshCookie(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.header('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (bearerToken) {
    try {
      const payload = verifyAccessToken(bearerToken);
      req.auth = { userId: payload.sub, email: payload.email };
      next();
      return;
    } catch {
      throw createHttpError(401, 'Invalid access token');
    }
  }

  const refreshCookie = req.cookies?.[env.REFRESH_COOKIE_NAME] as string | undefined;
  if (!refreshCookie) {
    throw createHttpError(401, 'Authentication required');
  }

  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshCookie);
  } catch {
    throw createHttpError(401, 'Invalid refresh token');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true },
  });

  if (!user) {
    throw createHttpError(401, 'User not found');
  }

  req.auth = { userId: user.id, email: user.email };
  next();
}
