import express from 'express';
import 'express-async-errors';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorMiddleware } from '../../src/lib/error-middleware.js';

const SPACE_ID = 'caaaaaaaaaaaaaaaaaaaaaaa';
const TEMPLATE_ID_VISIBLE = 'cbbbbbbbbbbbbbbbbbbbbbbb';
const TEMPLATE_ID_HIDDEN = 'cccccccccccccccccccccccc';

const mockedPrisma = {
  page: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  pageContent: {
    findUnique: vi.fn(),
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

describe('pages template routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPermissions.requireSpaceRole.mockResolvedValue(undefined);
    mockedPermissions.canViewPage.mockImplementation(async (_userId: string, pageId: string) => pageId !== TEMPLATE_ID_HIDDEN);
  });

  it('lists only templates visible to the requester', async () => {
    mockedPrisma.page.findMany.mockResolvedValue([
      {
        id: TEMPLATE_ID_VISIBLE,
        title: 'Template Visible',
        slug: 'template-visible',
        updatedAt: new Date('2026-03-03T12:00:00.000Z'),
        content: { contentText: 'Visible template body' },
      },
      {
        id: TEMPLATE_ID_HIDDEN,
        title: 'Template Hidden',
        slug: 'template-hidden',
        updatedAt: new Date('2026-03-03T11:00:00.000Z'),
        content: { contentText: 'Hidden template body' },
      },
    ]);

    const { pagesRouter } = await import('../../src/modules/pages/pages.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/pages', pagesRouter);
    app.use(errorMiddleware);

    const response = await request(app).get(`/api/pages/space/${SPACE_ID}/templates`);

    expect(response.status).toBe(200);
    expect(response.body.templates).toHaveLength(1);
    expect(response.body.templates[0].id).toBe(TEMPLATE_ID_VISIBLE);
  });

  it('rejects create page when templatePageId is invalid', async () => {
    mockedPrisma.page.findFirst.mockResolvedValue(null);
    mockedPrisma.page.findUnique.mockResolvedValue({
      id: TEMPLATE_ID_VISIBLE,
      spaceId: SPACE_ID,
      isTemplate: false,
    });

    const { pagesRouter } = await import('../../src/modules/pages/pages.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/pages', pagesRouter);
    app.use(errorMiddleware);

    const response = await request(app).post('/api/pages').send({
      spaceId: SPACE_ID,
      parentId: null,
      title: 'Created from bad template',
      templatePageId: TEMPLATE_ID_VISIBLE,
    });

    expect(response.status).toBe(400);
    expect(mockedPrisma.page.create).not.toHaveBeenCalled();
  });
});
