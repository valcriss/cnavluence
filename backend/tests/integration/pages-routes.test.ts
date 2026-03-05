import express from 'express';
import 'express-async-errors';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorMiddleware } from '../../src/lib/error-middleware.js';

const SPACE_ID = 'caaaaaaaaaaaaaaaaaaaaaaa';
const PAGE_ID = 'cbbbbbbbbbbbbbbbbbbbbbbb';
const PARENT_ID = 'cccccccccccccccccccccccc';

const mockedPrisma = {
  page: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
  pageRestriction: {
    findMany: vi.fn(),
  },
  $transaction: vi.fn(),
};

const mockedPermissions = {
  canViewPage: vi.fn(),
  requireSpaceRole: vi.fn(),
};

const mockedCreateAuditLog = vi.fn();

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
vi.mock('../../src/modules/audit/audit-log.service.js', () => ({ createAuditLog: mockedCreateAuditLog }));

describe('pages routes hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPermissions.requireSpaceRole.mockResolvedValue(undefined);
    mockedPermissions.canViewPage.mockResolvedValue(true);
  });

  it('PATCH /:pageId/rename creates redirect when slug changes', async () => {
    mockedPrisma.page.findUnique.mockResolvedValue({
      id: PAGE_ID,
      spaceId: SPACE_ID,
      title: 'Old title',
      slug: 'old-title',
      parentId: null,
    });
    mockedPrisma.page.findFirst
      .mockResolvedValueOnce({ id: 'existing' })
      .mockResolvedValueOnce(null);

    const tx = {
      page: {
        update: vi.fn().mockResolvedValue({
          id: PAGE_ID,
          spaceId: SPACE_ID,
          title: 'New title',
          slug: 'new-title-2',
          parentId: null,
        }),
      },
      pageRedirect: {
        create: vi.fn().mockResolvedValue({ id: 'redirect_1' }),
      },
    };
    mockedPrisma.$transaction.mockImplementation(async (handler: (t: typeof tx) => Promise<unknown>) => handler(tx));

    const { pagesRouter } = await import('../../src/modules/pages/pages.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/pages', pagesRouter);
    app.use(errorMiddleware);

    const response = await request(app)
      .patch(`/api/pages/${PAGE_ID}/rename`)
      .send({ title: 'New title' });

    expect(response.status).toBe(200);
    expect(response.body.page.slug).toBe('new-title-2');
    expect(tx.pageRedirect.create).toHaveBeenCalledWith({
      data: {
        pageId: PAGE_ID,
        oldSlug: 'old-title',
      },
    });
    expect(mockedCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: PAGE_ID,
        eventType: 'PAGE_RENAMED',
      }),
    );
  });

  it('PATCH /:pageId/move rejects cycle moves', async () => {
    mockedPrisma.page.findUnique
      .mockResolvedValueOnce({
        id: PAGE_ID,
        spaceId: SPACE_ID,
        parentId: null,
      })
      .mockResolvedValueOnce({
        id: PARENT_ID,
        parentId: PAGE_ID,
      });

    const { pagesRouter } = await import('../../src/modules/pages/pages.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/pages', pagesRouter);
    app.use(errorMiddleware);

    const response = await request(app)
      .patch(`/api/pages/${PAGE_ID}/move`)
      .send({ parentId: PARENT_ID });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Move would create a cycle');
    expect(mockedPrisma.page.update).not.toHaveBeenCalled();
  });

  it('GET canonical route marks old slug for redirect', async () => {
    mockedPrisma.page.findUnique.mockResolvedValue({
      id: PAGE_ID,
      slug: 'new-slug',
      redirects: [{ oldSlug: 'old-slug' }],
      space: { key: 'SPACE' },
    });

    const { pagesRouter } = await import('../../src/modules/pages/pages.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/pages', pagesRouter);
    app.use(errorMiddleware);

    const response = await request(app).get(`/api/pages/space/SPACE/pages/${PAGE_ID}-old-slug`);

    expect(response.status).toBe(200);
    expect(response.body.needsRedirect).toBe(true);
    expect(response.body.redirectedFromOldSlug).toBe(true);
    expect(response.body.canonicalUrl).toBe(`/space/SPACE/pages/${PAGE_ID}-new-slug`);
  });

  it('PUT /:pageId/restrictions rejects unknown or unauthorized users', async () => {
    mockedPrisma.page.findUnique.mockResolvedValue({
      id: PAGE_ID,
      spaceId: SPACE_ID,
      restrictions: [],
    });
    mockedPrisma.user.findMany.mockResolvedValue([]);

    const { pagesRouter } = await import('../../src/modules/pages/pages.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/pages', pagesRouter);
    app.use(errorMiddleware);

    const response = await request(app)
      .put(`/api/pages/${PAGE_ID}/restrictions`)
      .send({
        view: { userEmails: ['missing@example.test'], roles: [] },
        edit: { userEmails: [], roles: [] },
      });

    expect(response.status).toBe(400);
    expect(String(response.body.message)).toContain('Unknown or unauthorized users');
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('GET /:pageId/restrictions returns mapped user and role entries', async () => {
    mockedPrisma.page.findUnique.mockResolvedValue({
      id: PAGE_ID,
      spaceId: SPACE_ID,
      restrictions: [
        { id: 'r_view_user', type: 'VIEW', userId: 'user_allowed', role: null },
        { id: 'r_view_role', type: 'VIEW', userId: null, role: 'SPACE_EDITOR' },
        { id: 'r_edit_role', type: 'EDIT', userId: null, role: 'SPACE_ADMIN' },
      ],
    });
    mockedPrisma.user.findMany.mockResolvedValue([
      { id: 'user_allowed', email: 'allowed@example.test', displayName: 'Allowed User' },
    ]);

    const { pagesRouter } = await import('../../src/modules/pages/pages.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/pages', pagesRouter);
    app.use(errorMiddleware);

    const response = await request(app).get(`/api/pages/${PAGE_ID}/restrictions`);

    expect(response.status).toBe(200);
    expect(response.body.pageId).toBe(PAGE_ID);
    expect(response.body.view).toEqual([
      {
        id: 'r_view_user',
        role: null,
        user: { id: 'user_allowed', email: 'allowed@example.test', displayName: 'Allowed User' },
      },
      {
        id: 'r_view_role',
        role: 'SPACE_EDITOR',
        user: null,
      },
    ]);
    expect(response.body.edit).toEqual([
      {
        id: 'r_edit_role',
        role: 'SPACE_ADMIN',
        user: null,
      },
    ]);
  });

  it('PUT /:pageId/restrictions normalizes users/roles and persists deduplicated entries', async () => {
    mockedPrisma.page.findUnique.mockResolvedValue({
      id: PAGE_ID,
      spaceId: SPACE_ID,
      restrictions: [{ type: 'VIEW', userId: 'legacy', role: null }],
    });
    mockedPrisma.user.findMany.mockResolvedValue([
      { id: 'user_a', normalizedEmail: 'alice@example.test' },
      { id: 'user_b', normalizedEmail: 'bob@example.test' },
    ]);
    mockedPrisma.pageRestriction.findMany.mockResolvedValue([
      { type: 'VIEW', userId: 'user_a', role: null },
      { type: 'VIEW', userId: null, role: 'SPACE_EDITOR' },
      { type: 'EDIT', userId: 'user_b', role: null },
    ]);

    const tx = {
      pageRestriction: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
    };
    mockedPrisma.$transaction.mockImplementation(async (handler: (t: typeof tx) => Promise<unknown>) => handler(tx));

    const { pagesRouter } = await import('../../src/modules/pages/pages.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/pages', pagesRouter);
    app.use(errorMiddleware);

    const response = await request(app)
      .put(`/api/pages/${PAGE_ID}/restrictions`)
      .send({
        view: {
          userEmails: ['Alice@Example.test', 'alice@example.test'],
          roles: ['SPACE_EDITOR', 'SPACE_EDITOR'],
        },
        edit: {
          userEmails: ['bob@example.test'],
          roles: [],
        },
      });

    expect(response.status).toBe(204);
    expect(tx.pageRestriction.deleteMany).toHaveBeenCalledWith({ where: { pageId: PAGE_ID } });
    expect(tx.pageRestriction.createMany).toHaveBeenCalledWith({
      data: [
        { pageId: PAGE_ID, type: 'VIEW', userId: 'user_a', role: null },
        { pageId: PAGE_ID, type: 'VIEW', userId: null, role: 'SPACE_EDITOR' },
        { pageId: PAGE_ID, type: 'EDIT', userId: 'user_b', role: null },
      ],
    });
    expect(mockedCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: PAGE_ID,
        eventType: 'PAGE_PERMISSION_CHANGED',
      }),
    );
  });
});
