import { Router } from 'express';
import multer from 'multer';
import createHttpError from 'http-errors';
import { z } from 'zod';
import { SpaceRole } from '../../lib/prisma-enums.js';
import { requireAuth } from '../auth/auth-middleware.js';
import { prisma } from '../../lib/prisma.js';
import { canEditPage, canViewPage, requireSpaceRole } from '../permissions/permissions.service.js';
import { createAuditLog } from '../audit/audit-log.service.js';
import { getLocalFileStream, saveLocalFile } from './storage.service.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const listQuerySchema = z.object({
  pageId: z.string().cuid().optional(),
  spaceId: z.string().cuid(),
});

export const attachmentsRouter = Router();

attachmentsRouter.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    throw createHttpError(400, 'Missing file');
  }

  const spaceId = z.string().cuid().parse(req.body.spaceId);
  const pageId = req.body.pageId ? z.string().cuid().parse(req.body.pageId) : undefined;

  await requireSpaceRole(req.auth!.userId, spaceId, SpaceRole.SPACE_EDITOR);

  if (pageId) {
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      select: { id: true, spaceId: true },
    });

    if (page?.spaceId !== spaceId) {
      throw createHttpError(400, 'Invalid pageId for space');
    }

    if (!(await canEditPage(req.auth!.userId, pageId))) {
      throw createHttpError(403, 'No edit access to page');
    }
  }

  const storageKey = await saveLocalFile(req.file);

  const attachment = await prisma.attachment.create({
    data: {
      spaceId,
      pageId,
      uploaderUserId: req.auth!.userId,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
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

  res.status(201).json({ attachment });
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
