import type { NextFunction, Request, Response } from 'express';
import createHttpError from 'http-errors';

export function errorMiddleware(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (createHttpError.isHttpError(error)) {
    res.status(error.statusCode).json({
      message: error.message,
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    message: 'Internal server error',
  });
}
