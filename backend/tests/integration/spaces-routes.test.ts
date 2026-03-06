import express from 'express';
import 'express-async-errors';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorMiddleware } from '../../src/lib/error-middleware.js';

const mockedPrisma = {
  spaceMembership: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  space: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  $transaction: vi.fn(),
};

const mockedPermissions = {
  requireSiteAdmin: vi.fn(),
  requireSpaceRole: vi.fn(),
};

const mockedCreateAuditLog = vi.fn();

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: mockedPrisma,
}));

vi.mock('../../src/modules/auth/auth-middleware.js', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.auth = { userId: 'user_admin', email: 'admin@example.test' };
    next();
  },
}));

vi.mock('../../src/modules/permissions/permissions.service.js', () => mockedPermissions);
vi.mock('../../src/modules/audit/audit-log.service.js', () => ({ createAuditLog: mockedCreateAuditLog }));

describe('spaces routes settings admin', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedPermissions.requireSiteAdmin.mockResolvedValue(undefined);
    mockedPermissions.requireSpaceRole.mockResolvedValue(undefined);
    mockedPrisma.$transaction.mockResolvedValue(undefined);
  });

  it('POST /spaces auto-generates unique key and creates owner/admin memberships', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ id: 'cbbbbbbbbbbbbbbbbbbbbbbb' });
    mockedPrisma.space.findUnique.mockResolvedValueOnce({ id: 'space_existing' }).mockResolvedValueOnce(null);
    mockedPrisma.space.create.mockResolvedValue({
      id: 'space_1',
      key: 'nouvelle-collection-2',
      name: 'Nouvelle Collection',
      description: 'Description courte',
      archivedAt: null,
      isPersonal: false,
      personalOwnerUserId: null,
      createdAt: new Date('2026-03-06T10:00:00.000Z'),
      updatedAt: new Date('2026-03-06T10:00:00.000Z'),
      _count: { pages: 0 },
      memberships: [
        {
          userId: 'cbbbbbbbbbbbbbbbbbbbbbbb',
          role: 'SPACE_ADMIN',
          user: { id: 'cbbbbbbbbbbbbbbbbbbbbbbb', email: 'owner@example.test', displayName: 'Owner' },
        },
        {
          userId: 'user_admin',
          role: 'SPACE_ADMIN',
          user: { id: 'user_admin', email: 'admin@example.test', displayName: 'Admin' },
        },
      ],
    });

    const { spacesRouter } = await import('../../src/modules/spaces/spaces.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/spaces', spacesRouter);
    app.use(errorMiddleware);

    const response = await request(app).post('/api/spaces').send({
      name: 'Nouvelle Collection',
      description: 'Description courte',
      ownerUserId: 'cbbbbbbbbbbbbbbbbbbbbbbb',
    });

    expect(response.status).toBe(201);
    expect(response.body.space.key).toBe('nouvelle-collection-2');
    expect(response.body.space.owners).toHaveLength(2);
    expect(mockedPrisma.space.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key: 'nouvelle-collection-2',
          name: 'Nouvelle Collection',
        }),
      }),
    );
  });

  it('POST /spaces/admin/collections/:spaceId/archive requires second confirmation when pages exist', async () => {
    mockedPrisma.space.findUnique.mockResolvedValue({
      id: 'space_1',
      name: 'Engineering',
      archivedAt: null,
      isPersonal: false,
      _count: { pages: 3 },
    });

    const { spacesRouter } = await import('../../src/modules/spaces/spaces.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/spaces', spacesRouter);
    app.use(errorMiddleware);

    const response = await request(app)
      .post('/api/spaces/admin/collections/space_1/archive')
      .send({ confirmName: 'Wrong name' });

    expect(response.status).toBe(400);
    expect(String(response.body.message)).toContain('Archive confirmation failed');
    expect(mockedPrisma.space.update).not.toHaveBeenCalled();
  });

  it('POST /spaces/admin/collections/:spaceId/archive rejects personal spaces', async () => {
    mockedPrisma.space.findUnique.mockResolvedValue({
      id: 'space_personal_1',
      name: 'Daniel Silvestre',
      archivedAt: null,
      isPersonal: true,
      _count: { pages: 0 },
    });

    const { spacesRouter } = await import('../../src/modules/spaces/spaces.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/spaces', spacesRouter);
    app.use(errorMiddleware);

    const response = await request(app)
      .post('/api/spaces/admin/collections/space_personal_1/archive')
      .send({});

    expect(response.status).toBe(400);
    expect(String(response.body.message)).toContain('Personal spaces cannot be archived');
  });

  it('DELETE /spaces/admin/collections/:spaceId/permanent rejects personal spaces', async () => {
    mockedPrisma.space.findUnique.mockResolvedValue({
      id: 'space_personal_1',
      name: 'Daniel Silvestre',
      archivedAt: new Date('2026-03-01T00:00:00.000Z'),
      isPersonal: true,
    });

    const { spacesRouter } = await import('../../src/modules/spaces/spaces.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/spaces', spacesRouter);
    app.use(errorMiddleware);

    const response = await request(app)
      .delete('/api/spaces/admin/collections/space_personal_1/permanent')
      .send({ confirmName: 'Daniel Silvestre' });

    expect(response.status).toBe(400);
    expect(String(response.body.message)).toContain('Personal spaces cannot be deleted manually');
    expect(mockedPrisma.space.delete).not.toHaveBeenCalled();
  });

  it('GET /spaces/admin/users returns active users for settings tab', async () => {
    mockedPrisma.user.findMany.mockResolvedValue([
      {
        id: 'user_1',
        email: 'one@example.test',
        displayName: 'One',
        siteRole: 'SITE_USER',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ]);

    const { spacesRouter } = await import('../../src/modules/spaces/spaces.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/spaces', spacesRouter);
    app.use(errorMiddleware);

    const response = await request(app).get('/api/spaces/admin/users');

    expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(1);
    expect(response.body.users[0].email).toBe('one@example.test');
  });
});
