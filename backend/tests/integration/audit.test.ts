import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeCursor } from '../../src/lib/cursor.js';
import { errorMiddleware } from '../../src/lib/error-middleware.js';

const mockedPrisma = {
  page: {
    findUnique: vi.fn(),
  },
  auditLog: {
    findMany: vi.fn(),
  },
};

const mockedPermissions = {
  canViewPage: vi.fn(),
  requireSiteAdmin: vi.fn(),
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

describe('audit routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPermissions.canViewPage.mockResolvedValue(true);
    mockedPermissions.requireSiteAdmin.mockResolvedValue(undefined);
    mockedPermissions.requireSpaceRole.mockResolvedValue(undefined);
  });

  it('returns 400 for invalid cursor', async () => {
    const { auditRouter } = await import('../../src/modules/audit/audit.routes.js');
    const app = express();
    app.use('/api/audit', auditRouter);
    app.use(errorMiddleware);

    const response = await request(app).get('/api/audit').query({ cursor: 'invalid-cursor' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Invalid cursor');
    expect(mockedPrisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('returns paginated logs with nextCursor', async () => {
    const now = new Date('2026-03-03T15:00:00.000Z');
    const older = new Date('2026-03-03T14:00:00.000Z');
    const oldest = new Date('2026-03-03T13:00:00.000Z');

    mockedPrisma.auditLog.findMany.mockResolvedValue([
      { id: 'log_3', at: now, eventType: 'PAGE_RENAMED' },
      { id: 'log_2', at: older, eventType: 'PAGE_CREATED' },
      { id: 'log_1', at: oldest, eventType: 'PAGE_MOVED' },
    ]);

    const { auditRouter } = await import('../../src/modules/audit/audit.routes.js');
    const app = express();
    app.use('/api/audit', auditRouter);
    app.use(errorMiddleware);

    const response = await request(app).get('/api/audit').query({ spaceId: 'space_1', limit: 2 });

    expect(response.status).toBe(200);
    expect(response.body.logs).toHaveLength(2);
    expect(response.body.logs[0].id).toBe('log_3');
    expect(response.body.logs[1].id).toBe('log_2');
    expect(response.body.nextCursor).toBeTruthy();

    const decoded = decodeCursor(response.body.nextCursor);
    expect(decoded).toEqual({
      createdAt: older.toISOString(),
      id: 'log_2',
    });

    expect(mockedPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 3,
        orderBy: [{ at: 'desc' }, { id: 'desc' }],
        where: expect.objectContaining({
          spaceId: 'space_1',
          pageId: undefined,
        }),
      }),
    );
  });

  it('applies cursor condition to query', async () => {
    mockedPrisma.auditLog.findMany.mockResolvedValue([]);
    const cursor = Buffer.from(
      JSON.stringify({ createdAt: '2026-03-01T10:00:00.000Z', id: 'log_cursor' }),
      'utf8',
    ).toString('base64url');

    const { auditRouter } = await import('../../src/modules/audit/audit.routes.js');
    const app = express();
    app.use('/api/audit', auditRouter);
    app.use(errorMiddleware);

    const response = await request(app).get('/api/audit').query({ spaceId: 'space_1', cursor, limit: 10 });

    expect(response.status).toBe(200);
    expect(mockedPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { at: { lt: new Date('2026-03-01T10:00:00.000Z') } },
            { AND: [{ at: new Date('2026-03-01T10:00:00.000Z') }, { id: { lt: 'log_cursor' } }] },
          ],
        }),
      }),
    );
  });
});
