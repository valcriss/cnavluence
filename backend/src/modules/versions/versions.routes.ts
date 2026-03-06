import { Router } from 'express';
import createHttpError from 'http-errors';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { VersionReason } from '../../lib/prisma-enums.js';
import { requireAuth } from '../auth/auth-middleware.js';
import { canEditPage, canViewPageIncludingArchived } from '../permissions/permissions.service.js';
import { createAuditLog } from '../audit/audit-log.service.js';
import { syncBacklinksForPage } from '../backlinks/backlinks.service.js';

const manualVersionSchema = z.object({
  pageId: z.string().cuid(),
});

const restoreSchema = z.object({
  versionId: z.string().cuid(),
});

export const versionsRouter = Router();

versionsRouter.get('/:pageId', requireAuth, async (req, res) => {
  if (!(await canViewPageIncludingArchived(req.auth!.userId, req.params.pageId))) {
    throw createHttpError(403, 'No page access');
  }

  const versions = await prisma.pageVersion.findMany({
    where: { pageId: req.params.pageId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  res.json({ versions });
});

versionsRouter.post('/manual', requireAuth, async (req, res) => {
  const payload = manualVersionSchema.parse(req.body);

  if (!(await canEditPage(req.auth!.userId, payload.pageId))) {
    throw createHttpError(403, 'No page edit access');
  }

  const content = await prisma.pageContent.findUnique({ where: { pageId: payload.pageId } });
  if (!content) {
    throw createHttpError(404, 'Page content not found');
  }

  const version = await prisma.pageVersion.create({
    data: {
      pageId: payload.pageId,
      actorUserId: req.auth!.userId,
      reason: VersionReason.MANUAL,
      snapshotContent: content.currentContent,
      snapshotText: content.contentText,
    },
  });

  await createAuditLog({
    actorUserId: req.auth!.userId,
    pageId: payload.pageId,
    eventType: 'PAGE_VERSION_CREATED',
    after: { versionId: version.id, reason: version.reason },
  });

  res.status(201).json({ version });
});

versionsRouter.post('/restore', requireAuth, async (req, res) => {
  const payload = restoreSchema.parse(req.body);

  const version = await prisma.pageVersion.findUnique({
    where: { id: payload.versionId },
  });

  if (!version) {
    throw createHttpError(404, 'Version not found');
  }

  if (!(await canEditPage(req.auth!.userId, version.pageId))) {
    throw createHttpError(403, 'No page edit access');
  }

  const activeEditors = await prisma.pageEditorSession.count({
    where: { pageId: version.pageId },
  });

  if (activeEditors > 0) {
    throw createHttpError(409, 'Cannot restore while editors are active');
  }

  await prisma.$transaction(async (tx) => {
    await tx.pageContent.upsert({
      where: { pageId: version.pageId },
      update: {
        currentContent: version.snapshotContent,
        contentText: version.snapshotText,
      },
      create: {
        pageId: version.pageId,
        currentContent: version.snapshotContent,
        contentText: version.snapshotText,
      },
    });

    await tx.pageVersion.create({
      data: {
        pageId: version.pageId,
        actorUserId: req.auth!.userId,
        reason: VersionReason.RESTORE,
        snapshotContent: version.snapshotContent,
        snapshotText: version.snapshotText,
        restoredFromId: version.id,
      },
    });
  });

  await syncBacklinksForPage(version.pageId, version.snapshotContent);

  await createAuditLog({
    actorUserId: req.auth!.userId,
    pageId: version.pageId,
    eventType: 'PAGE_VERSION_RESTORED',
    after: { restoredFromVersionId: version.id },
  });

  res.status(204).send();
});

versionsRouter.get('/view/:versionId', requireAuth, async (req, res) => {
  const version = await prisma.pageVersion.findUnique({ where: { id: req.params.versionId } });

  if (!version) {
    throw createHttpError(404, 'Version not found');
  }

  if (!(await canViewPageIncludingArchived(req.auth!.userId, version.pageId))) {
    throw createHttpError(403, 'No page access');
  }

  res.json({ version });
});
