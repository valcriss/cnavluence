import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import createHttpError from 'http-errors';
import path from 'node:path';
import fs from 'node:fs';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorMiddleware } from './lib/error-middleware.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { spacesRouter } from './modules/spaces/spaces.routes.js';
import { pagesRouter } from './modules/pages/pages.routes.js';
import { contentRouter } from './modules/content/content.routes.js';
import { versionsRouter } from './modules/versions/versions.routes.js';
import { searchRouter } from './modules/search/search.routes.js';
import { attachmentsRouter } from './modules/attachments/attachments.routes.js';
import { auditRouter } from './modules/audit/audit.routes.js';
import { prisma } from './lib/prisma.js';
import { collabMetrics } from './modules/collab/collab.server.js';

export function createApp() {
  const app = express();
  const staticDir = path.resolve(process.cwd(), 'public');
  const appOrigin = new URL(env.APP_URL).origin;

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || origin === appOrigin) {
          callback(null, true);
          return;
        }
        callback(createHttpError(403, 'Origin not allowed'));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  app.use((req, _res, next) => {
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    if (!isMutation) {
      next();
      return;
    }

    const origin = req.header('origin');
    if (origin && origin !== appOrigin) {
      next(createHttpError(403, 'Origin not allowed'));
      return;
    }

    next();
  });

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/metrics', async (_req, res) => {
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - started;

    res.json({
      ws: collabMetrics(),
      dbLatencyMs,
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/spaces', spacesRouter);
  app.use('/api/pages', pagesRouter);
  app.use('/api/content', contentRouter);
  app.use('/api/versions', versionsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/attachments', attachmentsRouter);
  app.use('/api/audit', auditRouter);

  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
        next();
        return;
      }

      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  app.use(errorMiddleware);

  return app;
}
