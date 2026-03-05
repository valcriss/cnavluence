import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/auth-middleware.js';
import { prisma } from '../../lib/prisma.js';
import { canViewPage, requireSiteAdmin, requireSpaceRole } from '../permissions/permissions.service.js';
import { decodeCursor, encodeCursor } from '../../lib/cursor.js';

const querySchema = z.object({
  spaceId: z.string().optional(),
  pageId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
});

export const auditRouter = Router();

auditRouter.get('/', requireAuth, async (req, res) => {
  const query = querySchema.parse(req.query);
  const decodedCursor = decodeCursor(query.cursor);
  if (query.cursor && !decodedCursor) {
    res.status(400).json({ message: 'Invalid cursor' });
    return;
  }
  let effectiveSpaceId: string | undefined = query.spaceId;

  if (!query.spaceId && !query.pageId) {
    await requireSiteAdmin(req.auth!.userId);
  }

  if (query.pageId) {
    const page = await prisma.page.findUnique({
      where: { id: query.pageId },
      select: { id: true, spaceId: true },
    });

    if (!page) {
      res.status(404).json({ message: 'Page not found' });
      return;
    }

    if (query.spaceId && query.spaceId !== page.spaceId) {
      res.status(400).json({ message: 'pageId does not belong to provided spaceId' });
      return;
    }

    if (!(await canViewPage(req.auth!.userId, page.id))) {
      res.status(403).json({ message: 'No access to page' });
      return;
    }

    effectiveSpaceId = page.spaceId;
  }

  if (effectiveSpaceId) {
    await requireSpaceRole(req.auth!.userId, effectiveSpaceId, 'SPACE_VIEWER');
  }

  const logs = await prisma.auditLog.findMany({
    where: {
      spaceId: effectiveSpaceId,
      pageId: query.pageId,
      at: {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      },
      ...(decodedCursor
        ? {
            OR: [
              { at: { lt: new Date(decodedCursor.createdAt) } },
              {
                AND: [{ at: new Date(decodedCursor.createdAt) }, { id: { lt: decodedCursor.id } }],
              },
            ],
          }
        : {}),
    },
    orderBy: [{ at: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    include: {
      actor: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
      page: {
        select: {
          id: true,
          title: true,
          slug: true,
        },
      },
      space: {
        select: {
          id: true,
          key: true,
          name: true,
        },
      },
    },
  });

  const hasMore = logs.length > query.limit;
  const pageItems = hasMore ? logs.slice(0, query.limit) : logs;
  const last = pageItems.at(-1);
  const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.at.toISOString(), id: last.id }) : null;

  res.json({ logs: pageItems, nextCursor });
});
