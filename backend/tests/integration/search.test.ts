import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorMiddleware } from '../../src/lib/error-middleware.js';
import { encodeCursor } from '../../src/lib/cursor.js';

const mockedPrisma = {
  $queryRaw: vi.fn(),
};

vi.mock('../../src/config/env.js', () => ({
  env: {
    SEARCH_PAGE_SIZE: 20,
  },
}));

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: mockedPrisma,
}));

vi.mock('../../src/modules/auth/auth-middleware.js', () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.auth = { userId: 'user_1', email: 'user1@example.test' };
    next();
  },
}));

describe('search route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when cursor is invalid', async () => {
    const { searchRouter } = await import('../../src/modules/search/search.routes.js');
    const app = express();
    app.use('/api/search', searchRouter);
    app.use(errorMiddleware);

    const response = await request(app).get('/api/search').query({
      q: 'test',
      cursor: 'invalid-cursor',
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Invalid cursor');
    expect(mockedPrisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns results ordered by score desc, updatedAt desc, id desc and emits nextCursor from last item', async () => {
    mockedPrisma.$queryRaw.mockResolvedValue([
      {
        id: 'cm0000000000000000000003',
        title: 'Title match',
        slug: 'title-match',
        updatedAt: new Date('2026-03-03T10:02:00.000Z'),
        spaceId: 'cspace000000000000000001',
        spaceKey: 'ENG',
        spaceName: 'Engineering',
        score: 3.2,
        snippet: '<mark>title</mark> snippet',
      },
      {
        id: 'cm0000000000000000000002',
        title: 'Body match newer',
        slug: 'body-match-newer',
        updatedAt: new Date('2026-03-03T10:01:00.000Z'),
        spaceId: 'cspace000000000000000001',
        spaceKey: 'ENG',
        spaceName: 'Engineering',
        score: 3.2,
        snippet: 'body snippet',
      },
      {
        id: 'cm0000000000000000000001',
        title: 'Body match older',
        slug: 'body-match-older',
        updatedAt: new Date('2026-03-03T10:01:00.000Z'),
        spaceId: 'cspace000000000000000001',
        spaceKey: 'ENG',
        spaceName: 'Engineering',
        score: 3.2,
        snippet: 'body older snippet',
      },
    ]);

    const { searchRouter } = await import('../../src/modules/search/search.routes.js');
    const app = express();
    app.use('/api/search', searchRouter);
    app.use(errorMiddleware);

    const response = await request(app).get('/api/search').query({
      q: 'title',
      limit: 2,
    });

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items[0].id).toBe('cm0000000000000000000003');
    expect(response.body.items[1].id).toBe('cm0000000000000000000002');
    expect(response.body.items[0].canonicalUrl).toBe('/space/ENG/pages/cm0000000000000000000003-title-match');

    const decodedNext = response.body.nextCursor ? Buffer.from(response.body.nextCursor, 'base64').toString('utf8') : '';
    expect(decodedNext).toContain('cm0000000000000000000002');
    expect(decodedNext).toContain('2026-03-03T10:01:00.000Z');
    expect(decodedNext).toContain('3.2');
  });

  it('passes decoded strict cursor tuple to query for stable pagination', async () => {
    mockedPrisma.$queryRaw.mockResolvedValue([]);
    const cursor = encodeCursor({
      createdAt: '2026-03-03T10:01:00.000Z',
      id: 'cm0000000000000000000002',
      score: 3.2,
    });

    const { searchRouter } = await import('../../src/modules/search/search.routes.js');
    const app = express();
    app.use('/api/search', searchRouter);
    app.use(errorMiddleware);

    const response = await request(app).get('/api/search').query({
      q: 'title',
      cursor,
      limit: 20,
    });

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
    expect(response.body.nextCursor).toBeNull();

    const rawSqlCall = String(mockedPrisma.$queryRaw.mock.calls[0]?.[0] ?? '');
    expect(rawSqlCall).toContain('r.score <');
    expect(rawSqlCall).toContain('r."updatedAt" <');
    expect(rawSqlCall).toContain('r.id <');
    expect(rawSqlCall).toContain('ORDER BY r.score DESC, r."updatedAt" DESC, r.id DESC');
  });
});
