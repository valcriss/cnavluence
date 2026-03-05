import express from 'express';
import 'express-async-errors';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorMiddleware } from '../../src/lib/error-middleware.js';

const mockedPrisma = {
  pageVersion: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  pageContent: {
    findUnique: vi.fn(),
  },
  pageEditorSession: {
    count: vi.fn(),
  },
  $transaction: vi.fn(),
};

const mockedCanViewPage = vi.fn();
const mockedCanEditPage = vi.fn();
const mockedCreateAuditLog = vi.fn();
const mockedSyncBacklinksForPage = vi.fn();

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: mockedPrisma,
}));

vi.mock('../../src/modules/auth/auth-middleware.js', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.auth = { userId: 'user_1', email: 'user1@example.test' };
    next();
  },
}));

vi.mock('../../src/modules/permissions/permissions.service.js', () => ({
  canViewPage: mockedCanViewPage,
  canEditPage: mockedCanEditPage,
}));

vi.mock('../../src/modules/audit/audit-log.service.js', () => ({
  createAuditLog: mockedCreateAuditLog,
}));

vi.mock('../../src/modules/backlinks/backlinks.service.js', () => ({
  syncBacklinksForPage: mockedSyncBacklinksForPage,
}));

describe('versions routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /:pageId returns 403 when page is not viewable', async () => {
    mockedCanViewPage.mockResolvedValue(false);
    const { versionsRouter } = await import('../../src/modules/versions/versions.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/versions', versionsRouter);
    app.use(errorMiddleware);

    const response = await request(app).get('/api/versions/page_1');
    expect(response.status).toBe(403);
    expect(mockedPrisma.pageVersion.findMany).not.toHaveBeenCalled();
  });

  it('POST /manual returns 404 when page content is missing', async () => {
    mockedCanEditPage.mockResolvedValue(true);
    mockedPrisma.pageContent.findUnique.mockResolvedValue(null);

    const { versionsRouter } = await import('../../src/modules/versions/versions.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/versions', versionsRouter);
    app.use(errorMiddleware);

    const response = await request(app).post('/api/versions/manual').send({ pageId: 'cm1234567890123456789012' });
    expect(response.status).toBe(404);
  });

  it('POST /restore returns 409 when editors are active', async () => {
    mockedPrisma.pageVersion.findUnique.mockResolvedValue({
      id: 'cm1234567890123456789012',
      pageId: 'cm1234567890123456789013',
      snapshotContent: { type: 'doc', content: [] },
      snapshotText: 'hello',
    });
    mockedCanEditPage.mockResolvedValue(true);
    mockedPrisma.pageEditorSession.count.mockResolvedValue(1);

    const { versionsRouter } = await import('../../src/modules/versions/versions.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/versions', versionsRouter);
    app.use(errorMiddleware);

    const response = await request(app).post('/api/versions/restore').send({ versionId: 'cm1234567890123456789012' });
    expect(response.status).toBe(409);
  });

  it('POST /restore restores content and creates restore version', async () => {
    mockedPrisma.pageVersion.findUnique.mockResolvedValue({
      id: 'cm1234567890123456789012',
      pageId: 'cm1234567890123456789013',
      snapshotContent: { type: 'doc', content: [] },
      snapshotText: 'restored content',
    });
    mockedCanEditPage.mockResolvedValue(true);
    mockedPrisma.pageEditorSession.count.mockResolvedValue(0);

    const tx = {
      pageContent: {
        upsert: vi.fn(),
      },
      pageVersion: {
        create: vi.fn(),
      },
    };
    mockedPrisma.$transaction.mockImplementation(async (handler: (t: typeof tx) => Promise<void>) => handler(tx));

    const { versionsRouter } = await import('../../src/modules/versions/versions.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/versions', versionsRouter);
    app.use(errorMiddleware);

    const response = await request(app).post('/api/versions/restore').send({ versionId: 'cm1234567890123456789012' });

    expect(response.status).toBe(204);
    expect(tx.pageContent.upsert).toHaveBeenCalledOnce();
    expect(tx.pageVersion.create).toHaveBeenCalledOnce();
    expect(mockedSyncBacklinksForPage).toHaveBeenCalledWith('cm1234567890123456789013', { type: 'doc', content: [] });
    expect(mockedCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user_1',
        pageId: 'cm1234567890123456789013',
        eventType: 'PAGE_VERSION_RESTORED',
      }),
    );
  });
});
