import express from 'express';
import 'express-async-errors';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorMiddleware } from '../../src/lib/error-middleware.js';

const TARGET_PAGE_ID = 'caaaaaaaaaaaaaaaaaaaaaaa';
const SOURCE_VISIBLE_PAGE_ID = 'cbbbbbbbbbbbbbbbbbbbbbbb';
const SOURCE_HIDDEN_PAGE_ID = 'cccccccccccccccccccccccc';

const mockedPrisma = {
  linkIndex: {
    findMany: vi.fn(),
  },
};

const mockedPermissions = {
  canViewPage: vi.fn(),
  requireSpaceRole: vi.fn(),
};

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: mockedPrisma,
}));

vi.mock('../../src/modules/auth/auth-middleware.js', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.auth = { userId: 'user_1', email: 'user1@example.test' };
    next();
  },
}));

vi.mock('../../src/modules/permissions/permissions.service.js', () => mockedPermissions);
vi.mock('../../src/modules/audit/audit-log.service.js', () => ({ createAuditLog: vi.fn() }));

describe('pages backlinks route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPermissions.canViewPage.mockImplementation(async (_userId: string, pageId: string) => pageId !== SOURCE_HIDDEN_PAGE_ID);
    mockedPrisma.linkIndex.findMany.mockResolvedValue([
      {
        fromPageId: SOURCE_VISIBLE_PAGE_ID,
        updatedAt: new Date('2026-03-03T12:00:00.000Z'),
        fromPage: {
          id: SOURCE_VISIBLE_PAGE_ID,
          title: 'Visible source',
          slug: 'visible-source',
          space: { id: 'space_1', key: 'ENG', name: 'Engineering' },
        },
      },
      {
        fromPageId: SOURCE_HIDDEN_PAGE_ID,
        updatedAt: new Date('2026-03-03T11:00:00.000Z'),
        fromPage: {
          id: SOURCE_HIDDEN_PAGE_ID,
          title: 'Hidden source',
          slug: 'hidden-source',
          space: { id: 'space_1', key: 'ENG', name: 'Engineering' },
        },
      },
    ]);
  });

  it('returns only visible backlinks', async () => {
    const { pagesRouter } = await import('../../src/modules/pages/pages.routes.js');
    const app = express();
    app.use('/api/pages', pagesRouter);
    app.use(errorMiddleware);

    const response = await request(app).get(`/api/pages/${TARGET_PAGE_ID}/backlinks`);

    expect(response.status).toBe(200);
    expect(response.body.backlinks).toHaveLength(1);
    expect(response.body.backlinks[0].fromPage.id).toBe(SOURCE_VISIBLE_PAGE_ID);
    expect(response.body.backlinks[0].fromPage.canonicalUrl).toBe(
      `/space/ENG/pages/${SOURCE_VISIBLE_PAGE_ID}-visible-source`,
    );
  });

  it('returns 403 when user cannot view target page', async () => {
    mockedPermissions.canViewPage.mockResolvedValue(false);
    const { pagesRouter } = await import('../../src/modules/pages/pages.routes.js');
    const app = express();
    app.use('/api/pages', pagesRouter);
    app.use(errorMiddleware);

    const response = await request(app).get(`/api/pages/${TARGET_PAGE_ID}/backlinks`);

    expect(response.status).toBe(403);
    expect(mockedPrisma.linkIndex.findMany).not.toHaveBeenCalled();
  });
});
