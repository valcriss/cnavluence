import { type PageVersion, type VersionReason } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { createAuditLog } from '../audit/audit-log.service.js';

function stableJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function isSameSnapshot(
  previous: Pick<PageVersion, 'snapshotContent' | 'snapshotText'>,
  current: { currentContent: unknown; contentText: string },
): boolean {
  return (
    previous.snapshotText === current.contentText &&
    stableJson(previous.snapshotContent) === stableJson(current.currentContent)
  );
}

export async function createVersionIfChanged(params: {
  pageId: string;
  reason: VersionReason;
  actorUserId?: string | null;
  force?: boolean;
}): Promise<PageVersion | null> {
  const { pageId, reason, actorUserId, force = false } = params;

  const content = await prisma.pageContent.findUnique({ where: { pageId } });
  if (!content) {
    return null;
  }

  const lastVersion = await prisma.pageVersion.findFirst({
    where: { pageId },
    orderBy: { createdAt: 'desc' },
  });

  if (!force && lastVersion && isSameSnapshot(lastVersion, content)) {
    return null;
  }

  const version = await prisma.pageVersion.create({
    data: {
      pageId,
      actorUserId: actorUserId ?? null,
      reason,
      snapshotContent: content.currentContent,
      snapshotText: content.contentText,
    },
  });

  await createAuditLog({
    actorUserId: actorUserId ?? null,
    pageId,
    eventType: 'PAGE_VERSION_CREATED',
    after: { versionId: version.id, reason: version.reason },
  });

  return version;
}
