import type { AuditEventType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export async function createAuditLog(params: {
  actorUserId?: string;
  spaceId?: string;
  pageId?: string;
  eventType: AuditEventType;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId: params.actorUserId,
      spaceId: params.spaceId,
      pageId: params.pageId,
      eventType: params.eventType,
      before: params.before as object | undefined,
      after: params.after as object | undefined,
    },
  });
}
