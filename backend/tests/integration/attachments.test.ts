import express from 'express';
import 'express-async-errors';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorMiddleware } from '../../src/lib/error-middleware.js';

const SPACE_ID = 'caaaaaaaaaaaaaaaaaaaaaaa';
const PAGE_ID = 'cbbbbbbbbbbbbbbbbbbbbbbb';
const ATTACHMENT_ID = 'cccccccccccccccccccccccc';

const mockedPrisma = {
  page: {
    findUnique: vi.fn(),
  },
  attachment: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
};

const mockedPermissions = {
  canEditPage: vi.fn(),
  canViewPage: vi.fn(),
  requireSpaceRole: vi.fn(),
};

const mockedStorage = {
  saveLocalFile: vi.fn(),
  getLocalFileStream: vi.fn(),
};

const mockedAudit = {
  createAuditLog: vi.fn(),
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
vi.mock('../../src/modules/attachments/storage.service.js', () => mockedStorage);
vi.mock('../../src/modules/audit/audit-log.service.js', () => mockedAudit);

describe('attachments routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPermissions.requireSpaceRole.mockResolvedValue(undefined);
    mockedPermissions.canEditPage.mockResolvedValue(true);
    mockedPermissions.canViewPage.mockResolvedValue(true);
    mockedStorage.saveLocalFile.mockResolvedValue('storage/key.txt');
    mockedPrisma.page.findUnique.mockResolvedValue({ id: PAGE_ID, spaceId: SPACE_ID });
    mockedPrisma.attachment.create.mockResolvedValue({
      id: ATTACHMENT_ID,
      spaceId: SPACE_ID,
      pageId: PAGE_ID,
      filename: 'sample.txt',
      mimeType: 'text/plain',
      size: 11,
      storageKey: 'storage/key.txt',
    });
  });

  it('rejects upload when user cannot edit target page', async () => {
    mockedPermissions.canEditPage.mockResolvedValue(false);
    const { attachmentsRouter } = await import('../../src/modules/attachments/attachments.routes.js');
    const app = express();
    app.use('/api/attachments', attachmentsRouter);
    app.use(errorMiddleware);

    const response = await request(app)
      .post('/api/attachments/upload')
      .field('spaceId', SPACE_ID)
      .field('pageId', PAGE_ID)
      .attach('file', Buffer.from('hello', 'utf8'), {
        filename: 'sample.txt',
        contentType: 'text/plain',
      });

    expect(response.status).toBe(403);
    expect(mockedPrisma.attachment.create).not.toHaveBeenCalled();
  });

  it('rejects list for restricted page when user cannot view page', async () => {
    mockedPermissions.canViewPage.mockResolvedValue(false);
    const { attachmentsRouter } = await import('../../src/modules/attachments/attachments.routes.js');
    const app = express();
    app.use('/api/attachments', attachmentsRouter);
    app.use(errorMiddleware);

    const response = await request(app).get('/api/attachments').query({ spaceId: SPACE_ID, pageId: PAGE_ID });

    expect(response.status).toBe(403);
    expect(mockedPrisma.attachment.findMany).not.toHaveBeenCalled();
  });

  it('rejects download for restricted page when user cannot view page', async () => {
    mockedPermissions.canViewPage.mockResolvedValue(false);
    mockedPrisma.attachment.findUnique.mockResolvedValue({
      id: ATTACHMENT_ID,
      spaceId: SPACE_ID,
      pageId: PAGE_ID,
      filename: 'sample.txt',
      mimeType: 'text/plain',
      size: 11,
      storageKey: 'storage/key.txt',
    });

    const { attachmentsRouter } = await import('../../src/modules/attachments/attachments.routes.js');
    const app = express();
    app.use('/api/attachments', attachmentsRouter);
    app.use(errorMiddleware);

    const response = await request(app).get(`/api/attachments/${ATTACHMENT_ID}/download`);

    expect(response.status).toBe(403);
    expect(mockedStorage.getLocalFileStream).not.toHaveBeenCalled();
  });

  it('creates attachment when page edit access is granted', async () => {
    const { attachmentsRouter } = await import('../../src/modules/attachments/attachments.routes.js');
    const app = express();
    app.use('/api/attachments', attachmentsRouter);
    app.use(errorMiddleware);

    const response = await request(app)
      .post('/api/attachments/upload')
      .field('spaceId', SPACE_ID)
      .field('pageId', PAGE_ID)
      .attach('file', Buffer.from('hello world', 'utf8'), {
        filename: 'sample.txt',
        contentType: 'text/plain',
      });

    expect(response.status).toBe(201);
    expect(response.body.attachment.id).toBe(ATTACHMENT_ID);
    expect(mockedStorage.saveLocalFile).toHaveBeenCalled();
    expect(mockedPrisma.attachment.create).toHaveBeenCalled();
    expect(mockedAudit.createAuditLog).toHaveBeenCalled();
  });
});
