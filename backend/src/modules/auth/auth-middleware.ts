import type { Request, Response, NextFunction } from 'express';
import createHttpError from 'http-errors';
import { verifyAccessToken } from './tokens.js';

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
