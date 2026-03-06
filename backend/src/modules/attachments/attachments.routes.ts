import { Router, type Request } from 'express';
import multer from 'multer';
import createHttpError from 'http-errors';
import { z } from 'zod';
import { SpaceRole } from '../../lib/prisma-enums.js';
import { requireAuth, requireAuthOrRefreshCookie } from '../auth/auth-middleware.js';
import { prisma } from '../../lib/prisma.js';
import { canEditPage, canViewPage, requireSpaceRole } from '../permissions/permissions.service.js';
import { createAuditLog } from '../audit/audit-log.service.js';
import { getLocalFileStream, saveLocalFile } from './storage.service.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, IMAGE_MIME_TYPES.has(file.mimetype));
  },
});

const listQuerySchema = z.object({
  pageId: z.string().cuid().optional(),
  spaceId: z.string().cuid(),
});

export const attachmentsRouter = Router();

async function requireUploadTargetAccess(userId: string, spaceId: string, pageId?: string): Promise<void> {
  await requireSpaceRole(userId, spaceId, SpaceRole.SPACE_EDITOR);

  if (!pageId) {
    return;
  }

  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { id: true, spaceId: true },
  });

  if (page?.spaceId !== spaceId) {
    throw createHttpError(400, 'Invalid pageId for space');
  }

  if (!(await canEditPage(userId, pageId))) {
    throw createHttpError(403, 'No edit access to page');
  }
}

async function createAttachmentRecord(req: Request, storageKey: string, spaceId: string, pageId?: string) {
  const attachment = await prisma.attachment.create({
    data: {
      spaceId,
      pageId,
      uploaderUserId: req.auth!.userId,
      filename: req.file!.originalname,
      mimeType: req.file!.mimetype,
      size: req.file!.size,
      storageKey,
    },
  });

  await createAuditLog({
    actorUserId: req.auth!.userId,
    spaceId,
    pageId,
    eventType: 'ATTACHMENT_UPLOADED',
    after: {
      attachmentId: attachment.id,
      filename: attachment.filename,
      size: attachment.size,
    },
  });

  return attachment;
}

attachmentsRouter.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    throw createHttpError(400, 'Missing file');
  }

  const spaceId = z.string().cuid().parse(req.body.spaceId);
  const pageId = req.body.pageId ? z.string().cuid().parse(req.body.pageId) : undefined;

  await requireUploadTargetAccess(req.auth!.userId, spaceId, pageId);

  const storageKey = await saveLocalFile(req.file);
  const attachment = await createAttachmentRecord(req, storageKey, spaceId, pageId);

  res.status(201).json({ attachment });
});

attachmentsRouter.post('/upload-image', requireAuth, imageUpload.single('file'), async (req, res) => {
  if (!req.file) {
    throw createHttpError(400, 'Missing image file');
  }

  if (!IMAGE_MIME_TYPES.has(req.file.mimetype)) {
    throw createHttpError(400, 'Unsupported image format');
  }

  const spaceId = z.string().cuid().parse(req.body.spaceId);
  const pageId = req.body.pageId ? z.string().cuid().parse(req.body.pageId) : undefined;

  await requireUploadTargetAccess(req.auth!.userId, spaceId, pageId);

  const storageKey = await saveLocalFile(req.file);
  const attachment = await createAttachmentRecord(req, storageKey, spaceId, pageId);

  res.status(201).json({
    attachment,
    inlineUrl: `/api/attachments/${attachment.id}/inline`,
  });
});

attachmentsRouter.get('/', requireAuth, async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  await requireSpaceRole(req.auth!.userId, query.spaceId, SpaceRole.SPACE_VIEWER);

  if (query.pageId) {
    const page = await prisma.page.findUnique({
      where: { id: query.pageId },
      select: { id: true, spaceId: true },
    });

    if (page?.spaceId !== query.spaceId) {
      throw createHttpError(400, 'Invalid pageId for space');
    }

    if (!(await canViewPage(req.auth!.userId, page.id))) {
      throw createHttpError(403, 'No access to page');
    }
  }

  const attachments = await prisma.attachment.findMany({
    where: {
      spaceId: query.spaceId,
      pageId: query.pageId,
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ attachments });
});

attachmentsRouter.get('/:attachmentId/download', requireAuth, async (req, res) => {
  const attachment = await prisma.attachment.findUnique({ where: { id: req.params.attachmentId } });
  if (!attachment) {
    throw createHttpError(404, 'Attachment not found');
  }

  if (attachment.pageId) {
    if (!(await canViewPage(req.auth!.userId, attachment.pageId))) {
      throw createHttpError(403, 'No access to page');
    }
  } else {
    await requireSpaceRole(req.auth!.userId, attachment.spaceId, SpaceRole.SPACE_VIEWER);
  }

  res.setHeader('Content-Type', attachment.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${attachment.filename}"`);

  const stream = getLocalFileStream(attachment.storageKey);
  stream.pipe(res);
});

attachmentsRouter.get('/:attachmentId/inline', requireAuthOrRefreshCookie, async (req, res) => {
  const attachment = await prisma.attachment.findUnique({ where: { id: req.params.attachmentId } });
  if (!attachment) {
    throw createHttpError(404, 'Attachment not found');
  }

  if (!IMAGE_MIME_TYPES.has(attachment.mimeType)) {
    throw createHttpError(415, 'Attachment is not an image');
  }

  if (attachment.pageId) {
    if (!(await canViewPage(req.auth!.userId, attachment.pageId))) {
      throw createHttpError(403, 'No access to page');
    }
  } else {
    await requireSpaceRole(req.auth!.userId, attachment.spaceId, SpaceRole.SPACE_VIEWER);
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Type', attachment.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${attachment.filename}"`);

  const stream = getLocalFileStream(attachment.storageKey);
  stream.pipe(res);
});
