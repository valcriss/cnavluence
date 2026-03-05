import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test_access_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test_refresh_secret';

const mockedPrisma = {
  $queryRaw: vi.fn().mockResolvedValue([1]),
};

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: mockedPrisma,
}));

vi.mock('../../src/modules/collab/collab.server.js', () => ({
  collabMetrics: () => ({ activeRooms: 0, activeConnections: 0 }),
}));

let app: Express;

describe('health endpoints', () => {
  it('returns health', async () => {
    const { createApp } = await import('../../src/app.js');
    app = createApp();

    const response = await request(app).get('/healthz');
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it('returns metrics', async () => {
    const { createApp } = await import('../../src/app.js');
    app = createApp();

    const response = await request(app).get('/metrics');
    expect(response.status).toBe(200);
    expect(response.body.ws.activeRooms).toBe(0);
  });
});
