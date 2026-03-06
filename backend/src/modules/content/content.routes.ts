import { Router } from 'express';
import createHttpError from 'http-errors';
import { z } from 'zod';
import { SpaceRole, VersionReason } from '../../lib/prisma-enums.js';
import { requireAuth } from '../auth/auth-middleware.js';
import { prisma } from '../../lib/prisma.js';
import { canEditPage, canViewPageIncludingArchived, requireSpaceRole } from '../permissions/permissions.service.js';
import { extractTextFromProseMirror } from '../../lib/prosemirror-text.js';
import { createVersionIfChanged } from '../versions/version.service.js';
import { syncBacklinksForPage } from '../backlinks/backlinks.service.js';

const contentUpdateSchema = z.object({
  content: z.unknown(),
});

const sessionSchema = z.object({
  pageId: z.string().cuid(),
});

export const contentRouter = Router();

contentRouter.get('/:pageId', requireAuth, async (req, res) => {
  if (!(await canViewPageIncludingArchived(req.auth!.userId, req.params.pageId))) {
    throw createHttpError(403, 'No page view access');
  }

  const content = await prisma.pageContent.findUnique({
    where: { pageId: req.params.pageId },
  });

  if (!content) {
    throw createHttpError(404, 'Page content not found');
  }

  res.json({ content });
});

contentRouter.put('/:pageId', requireAuth, async (req, res) => {
  const payload = contentUpdateSchema.parse(req.body);
  const page = await prisma.page.findUnique({ where: { id: req.params.pageId } });
  if (!page) {
    throw createHttpError(404, 'Page not found');
  }

  await requireSpaceRole(req.auth!.userId, page.spaceId, SpaceRole.SPACE_EDITOR);
  if (!(await canEditPage(req.auth!.userId, page.id))) {
    throw createHttpError(403, 'No page edit access');
  }

  const contentText = extractTextFromProseMirror(payload.content);

  const updated = await prisma.pageContent.upsert({
    where: { pageId: page.id },
    update: {
      currentContent: payload.content as object,
      contentText,
    },
    create: {
      pageId: page.id,
      currentContent: payload.content as object,
      contentText,
    },
  });

  await syncBacklinksForPage(page.id, payload.content);

  res.json({ content: updated });
});

contentRouter.post('/session/enter', requireAuth, async (req, res) => {
  const payload = sessionSchema.parse(req.body);
  if (!(await canEditPage(req.auth!.userId, payload.pageId))) {
    throw createHttpError(403, 'No page edit access');
  }

  const session = await prisma.pageEditorSession.upsert({
    where: {
      pageId_userId: {
        pageId: payload.pageId,
        userId: req.auth!.userId,
      },
    },
    update: { lastSeenAt: new Date() },
    create: {
      pageId: payload.pageId,
      userId: req.auth!.userId,
    },
  });

  res.status(201).json({ session });
});

contentRouter.post('/session/leave', requireAuth, async (req, res) => {
  const payload = sessionSchema.parse(req.body);

  await prisma.pageEditorSession.deleteMany({
    where: {
      pageId: payload.pageId,
      userId: req.auth!.userId,
    },
  });

  const remainingEditors = await prisma.pageEditorSession.count({ where: { pageId: payload.pageId } });

  if (remainingEditors === 0) {
    await createVersionIfChanged({
      pageId: payload.pageId,
      actorUserId: req.auth!.userId,
      reason: VersionReason.AUTO_SESSION_END,
    });
  }

  res.status(204).send();
});
