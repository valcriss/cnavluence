import { Router } from 'express';
import createHttpError from 'http-errors';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { RestrictionType, SpaceRole } from '../../lib/prisma-enums.js';
import { slugify } from '../../lib/slug.js';
import { requireAuth } from '../auth/auth-middleware.js';
import {
  canViewPage,
  canViewPageIncludingArchived,
  getUserSpaceRole,
  hasAtLeastRole,
  requireSpaceRole,
} from '../permissions/permissions.service.js';
import { createAuditLog } from '../audit/audit-log.service.js';

const createPageSchema = z.object({
  spaceId: z.string().cuid(),
  parentId: z.string().cuid().nullable().optional(),
  title: z.string().min(1).max(240),
  isTemplate: z.boolean().default(false),
  templatePageId: z.string().cuid().optional(),
});

const renameSchema = z.object({
  title: z.string().min(1).max(240),
});

const moveSchema = z.object({
  parentId: z.string().cuid().nullable(),
});

const archiveSchema = z.object({
  archived: z.boolean(),
});

const archivedListSchema = z.object({
  spaceId: z.string().cuid().optional(),
});

const restrictionRoleSchema = z.nativeEnum(SpaceRole);

const upsertRestrictionsSchema = z.object({
  view: z
    .object({
      userEmails: z.array(z.string().email()).default([]),
      roles: z.array(restrictionRoleSchema).default([]),
    })
    .default({ userEmails: [], roles: [] }),
  edit: z
    .object({
      userEmails: z.array(z.string().email()).default([]),
      roles: z.array(restrictionRoleSchema).default([]),
    })
    .default({ userEmails: [], roles: [] }),
});

export const pagesRouter = Router();

async function buildUniqueSlug(spaceId: string, requestedTitle: string, excludePageId?: string): Promise<string> {
  const slugBase = slugify(requestedTitle);
  let slug = slugBase;
  let increment = 1;

  while (true) {
    const existing = await prisma.page.findFirst({
      where: {
        spaceId,
        slug,
        ...(excludePageId ? { id: { not: excludePageId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) {
      return slug;
    }

    increment += 1;
    slug = `${slugBase}-${increment}`;
  }
}

async function ensureNoCycle(pageId: string, newParentId: string | null): Promise<void> {
  let cursor = newParentId;
  while (cursor) {
    if (cursor === pageId) {
      throw createHttpError(400, 'Move would create a cycle');
    }

    const parent = await prisma.page.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });

    cursor = parent?.parentId ?? null;
  }
}

pagesRouter.get('/space/:spaceId/tree', requireAuth, async (req, res) => {
  await requireSpaceRole(req.auth!.userId, req.params.spaceId, SpaceRole.SPACE_VIEWER);

  const pages = await prisma.page.findMany({
    where: {
      spaceId: req.params.spaceId,
      archived: false,
    },
    orderBy: [{ parentId: 'asc' }, { title: 'asc' }],
  });

  res.json({ pages });
});

pagesRouter.get('/space/:spaceId/templates', requireAuth, async (req, res) => {
  await requireSpaceRole(req.auth!.userId, req.params.spaceId, SpaceRole.SPACE_VIEWER);

  const templates = await prisma.page.findMany({
    where: {
      spaceId: req.params.spaceId,
      archived: false,
      isTemplate: true,
    },
    include: {
      content: {
        select: {
          contentText: true,
        },
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { title: 'asc' }],
  });

  const visibleTemplates = [];
  for (const template of templates) {
    if (!(await canViewPage(req.auth!.userId, template.id))) {
      continue;
    }
    visibleTemplates.push(template);
  }

  res.json({
    templates: visibleTemplates.map((template) => ({
      id: template.id,
      title: template.title,
      slug: template.slug,
      updatedAt: template.updatedAt,
      preview: (template.content?.contentText ?? '').slice(0, 220),
    })),
  });
});

pagesRouter.get('/archived', requireAuth, async (req, res) => {
  const query = archivedListSchema.parse(req.query);

  const archivedPages = await prisma.page.findMany({
    where: {
      archived: true,
      ...(query.spaceId ? { spaceId: query.spaceId } : {}),
      space: {
        memberships: {
          some: {
            userId: req.auth!.userId,
          },
        },
      },
    },
    include: {
      space: {
        select: {
          id: true,
          key: true,
          name: true,
        },
      },
      restrictions: {
        select: {
          type: true,
          role: true,
          userId: true,
        },
      },
      content: {
        select: {
          contentText: true,
        },
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { title: 'asc' }],
    take: 300,
  });

  const visiblePages = [];
  for (const page of archivedPages) {
    const role = await getUserSpaceRole(req.auth!.userId, page.spaceId);
    if (!role) {
      continue;
    }

    const viewRestrictions = page.restrictions.filter((restriction) => restriction.type === RestrictionType.VIEW);
    const allowedByRestrictions =
      viewRestrictions.length === 0 ||
      viewRestrictions.some(
        (restriction) =>
          restriction.userId === req.auth!.userId ||
          (restriction.role && hasAtLeastRole(role, restriction.role)),
      );
    if (!allowedByRestrictions) {
      continue;
    }

    visiblePages.push(page);
  }

  res.json({
    pages: visiblePages.map((page) => ({
      id: page.id,
      title: page.title,
      slug: page.slug,
      archived: page.archived,
      updatedAt: page.updatedAt,
      space: page.space,
      snippet: (page.content?.contentText ?? '').slice(0, 220),
      canonicalUrl: `/space/${page.space.key}/pages/${page.id}-${page.slug}`,
    })),
  });
});

pagesRouter.get('/:pageId/breadcrumbs', requireAuth, async (req, res) => {
  if (!(await canViewPageIncludingArchived(req.auth!.userId, req.params.pageId))) {
    throw createHttpError(403, 'No access to page');
  }

  const breadcrumbs: Array<{ id: string; title: string; slug: string }> = [];
  let currentId: string | null = req.params.pageId;

  while (currentId) {
    const page = await prisma.page.findUnique({
      where: { id: currentId },
      select: { id: true, title: true, slug: true, parentId: true },
    });

    if (!page) {
      break;
    }

    breadcrumbs.unshift({ id: page.id, title: page.title, slug: page.slug });
    currentId = page.parentId;
  }

  res.json({ breadcrumbs });
});

pagesRouter.get('/:pageId/backlinks', requireAuth, async (req, res) => {
  if (!(await canViewPageIncludingArchived(req.auth!.userId, req.params.pageId))) {
    throw createHttpError(403, 'No access to page');
  }

  const linkRows = await prisma.linkIndex.findMany({
    where: {
      toPageId: req.params.pageId,
      fromPage: {
        archived: false,
      },
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      fromPage: {
        include: {
          space: {
            select: {
              id: true,
              key: true,
              name: true,
            },
          },
        },
      },
    },
  });

  const visibleRows = [];
  for (const row of linkRows) {
    if (!(await canViewPage(req.auth!.userId, row.fromPageId))) {
      continue;
    }
    visibleRows.push(row);
  }

  res.json({
    backlinks: visibleRows.map((row) => ({
      fromPage: {
        id: row.fromPage.id,
        title: row.fromPage.title,
        slug: row.fromPage.slug,
        canonicalUrl: `/space/${row.fromPage.space.key}/pages/${row.fromPage.id}-${row.fromPage.slug}`,
        space: row.fromPage.space,
      },
      updatedAt: row.updatedAt,
    })),
  });
});

pagesRouter.post('/', requireAuth, async (req, res) => {
  const payload = createPageSchema.parse(req.body);

  await requireSpaceRole(req.auth!.userId, payload.spaceId, SpaceRole.SPACE_EDITOR);

  if (payload.parentId) {
    const parent = await prisma.page.findUnique({ where: { id: payload.parentId } });
    if (parent?.spaceId !== payload.spaceId) {
      throw createHttpError(400, 'Invalid parent page');
    }
  }

  const slug = await buildUniqueSlug(payload.spaceId, payload.title);

  let templateContent: { currentContent: unknown; contentText: string } | null = null;
  if (payload.templatePageId) {
    const templatePage = await prisma.page.findUnique({
      where: { id: payload.templatePageId },
      select: { id: true, spaceId: true, isTemplate: true },
    });

    if (templatePage?.spaceId !== payload.spaceId || !templatePage?.isTemplate) {
      throw createHttpError(400, 'Invalid template page');
    }

    if (!(await canViewPage(req.auth!.userId, templatePage.id))) {
      throw createHttpError(403, 'No access to template page');
    }

    const template = await prisma.pageContent.findUnique({ where: { pageId: payload.templatePageId } });
    templateContent = template
      ? { currentContent: template.currentContent, contentText: template.contentText }
      : { currentContent: { type: 'doc', content: [] }, contentText: '' };
  }

  const page = await prisma.page.create({
    data: {
      spaceId: payload.spaceId,
      parentId: payload.parentId ?? null,
      title: payload.title,
      slug,
      isTemplate: payload.isTemplate,
      createdByUserId: req.auth!.userId,
      content: {
        create: {
          currentContent: (templateContent?.currentContent as object | undefined) ?? { type: 'doc', content: [] },
          contentText: templateContent?.contentText ?? '',
        },
      },
    },
  });

  await createAuditLog({
    actorUserId: req.auth!.userId,
    spaceId: page.spaceId,
    pageId: page.id,
    eventType: 'PAGE_CREATED',
    after: { title: page.title, parentId: page.parentId },
  });

  res.status(201).json({ page });
});

pagesRouter.get('/:pageId', requireAuth, async (req, res) => {
  const page = await prisma.page.findUnique({
    where: { id: req.params.pageId },
    include: {
      redirects: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      space: {
        select: { key: true },
      },
    },
  });

  if (!page) {
    throw createHttpError(404, 'Page not found');
  }

  if (!(await canViewPageIncludingArchived(req.auth!.userId, page.id))) {
    throw createHttpError(403, 'No access to page');
  }

  res.json({
    page,
    canonicalUrl: `/space/${page.space.key}/pages/${page.id}-${page.slug}`,
  });
});

pagesRouter.patch('/:pageId/rename', requireAuth, async (req, res) => {
  const payload = renameSchema.parse(req.body);
  const page = await prisma.page.findUnique({ where: { id: req.params.pageId } });

  if (!page) {
    throw createHttpError(404, 'Page not found');
  }

  await requireSpaceRole(req.auth!.userId, page.spaceId, SpaceRole.SPACE_EDITOR);

  const oldSlug = page.slug;
  const newSlug = await buildUniqueSlug(page.spaceId, payload.title, page.id);

  const updated = await prisma.$transaction(async (tx) => {
    const pageUpdate = await tx.page.update({
      where: { id: page.id },
      data: {
        title: payload.title,
        slug: newSlug,
      },
    });

    if (oldSlug !== newSlug) {
      await tx.pageRedirect.create({
        data: {
          pageId: page.id,
          oldSlug,
        },
      });
    }

    return pageUpdate;
  });

  await createAuditLog({
    actorUserId: req.auth!.userId,
    spaceId: page.spaceId,
    pageId: page.id,
    eventType: 'PAGE_RENAMED',
    before: { title: page.title, slug: oldSlug },
    after: { title: updated.title, slug: updated.slug },
  });

  res.json({ page: updated });
});

pagesRouter.patch('/:pageId/move', requireAuth, async (req, res) => {
  const payload = moveSchema.parse(req.body);
  const page = await prisma.page.findUnique({ where: { id: req.params.pageId } });

  if (!page) {
    throw createHttpError(404, 'Page not found');
  }

  await requireSpaceRole(req.auth!.userId, page.spaceId, SpaceRole.SPACE_EDITOR);
  await ensureNoCycle(page.id, payload.parentId);

  if (payload.parentId) {
    const newParent = await prisma.page.findUnique({ where: { id: payload.parentId } });
    if (!newParent || newParent.spaceId !== page.spaceId) {
      throw createHttpError(400, 'Invalid destination parent');
    }
  }

  const moved = await prisma.page.update({
    where: { id: page.id },
    data: { parentId: payload.parentId },
  });

  await createAuditLog({
    actorUserId: req.auth!.userId,
    spaceId: page.spaceId,
    pageId: page.id,
    eventType: 'PAGE_MOVED',
    before: { parentId: page.parentId },
    after: { parentId: moved.parentId },
  });

  res.json({ page: moved });
});

pagesRouter.patch('/:pageId/archive', requireAuth, async (req, res) => {
  const payload = archiveSchema.parse(req.body);
  const page = await prisma.page.findUnique({ where: { id: req.params.pageId } });

  if (!page) {
    throw createHttpError(404, 'Page not found');
  }

  await requireSpaceRole(req.auth!.userId, page.spaceId, SpaceRole.SPACE_EDITOR);

  const archived = await prisma.page.update({
    where: { id: page.id },
    data: { archived: payload.archived },
  });

  await createAuditLog({
    actorUserId: req.auth!.userId,
    spaceId: page.spaceId,
    pageId: page.id,
    eventType: payload.archived ? 'PAGE_ARCHIVED' : 'PAGE_RESTORED',
    after: { archived: payload.archived },
  });

  res.json({ page: archived });
});

pagesRouter.get('/:pageId/restrictions', requireAuth, async (req, res) => {
  const page = await prisma.page.findUnique({
    where: { id: req.params.pageId },
    include: { restrictions: true },
  });

  if (!page) {
    throw createHttpError(404, 'Page not found');
  }

  if (!(await canViewPageIncludingArchived(req.auth!.userId, page.id))) {
    throw createHttpError(403, 'No access to page');
  }

  const restrictions = page.restrictions;
  const userIds = restrictions
    .map((restriction) => restriction.userId)
    .filter((userId): userId is string => Boolean(userId));

  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, displayName: true },
      })
    : [];

  const userById = new Map(users.map((user) => [user.id, user]));
  const mapRestriction = (type: RestrictionType) =>
    restrictions
      .filter((restriction) => restriction.type === type)
      .map((restriction) => ({
        id: restriction.id,
        role: restriction.role,
        user: restriction.userId ? userById.get(restriction.userId) ?? null : null,
      }));

  res.json({
    pageId: page.id,
    view: mapRestriction(RestrictionType.VIEW),
    edit: mapRestriction(RestrictionType.EDIT),
  });
});

pagesRouter.put('/:pageId/restrictions', requireAuth, async (req, res) => {
  const payload = upsertRestrictionsSchema.parse(req.body);
  const page = await prisma.page.findUnique({
    where: { id: req.params.pageId },
    include: { restrictions: true },
  });

  if (!page) {
    throw createHttpError(404, 'Page not found');
  }

  await requireSpaceRole(req.auth!.userId, page.spaceId, SpaceRole.SPACE_ADMIN);

  const normalizedViewEmails = [...new Set(payload.view.userEmails.map((email) => email.trim().toLowerCase()))];
  const normalizedEditEmails = [...new Set(payload.edit.userEmails.map((email) => email.trim().toLowerCase()))];
  const allEmails = [...new Set([...normalizedViewEmails, ...normalizedEditEmails])];

  const users = allEmails.length
    ? await prisma.user.findMany({
        where: {
          normalizedEmail: { in: allEmails },
          memberships: { some: { spaceId: page.spaceId } },
        },
        select: { id: true, normalizedEmail: true },
      })
    : [];

  const usersByEmail = new Map(users.map((user) => [user.normalizedEmail, user.id]));
  const missingEmails = allEmails.filter((email) => !usersByEmail.has(email));
  if (missingEmails.length > 0) {
    throw createHttpError(400, `Unknown or unauthorized users: ${missingEmails.join(', ')}`);
  }

  const before = page.restrictions.map((restriction) => ({
    type: restriction.type,
    userId: restriction.userId,
    role: restriction.role,
  }));

  const viewRoles = [...new Set(payload.view.roles)];
  const editRoles = [...new Set(payload.edit.roles)];

  const restrictionsToCreate = [
    ...normalizedViewEmails.map((email) => ({
      pageId: page.id,
      type: RestrictionType.VIEW,
      userId: usersByEmail.get(email)!,
      role: null,
    })),
    ...viewRoles.map((role) => ({
      pageId: page.id,
      type: RestrictionType.VIEW,
      userId: null,
      role,
    })),
    ...normalizedEditEmails.map((email) => ({
      pageId: page.id,
      type: RestrictionType.EDIT,
      userId: usersByEmail.get(email)!,
      role: null,
    })),
    ...editRoles.map((role) => ({
      pageId: page.id,
      type: RestrictionType.EDIT,
      userId: null,
      role,
    })),
  ];

  await prisma.$transaction(async (tx) => {
    await tx.pageRestriction.deleteMany({ where: { pageId: page.id } });
    if (restrictionsToCreate.length > 0) {
      await tx.pageRestriction.createMany({ data: restrictionsToCreate });
    }
  });

  const updated = await prisma.pageRestriction.findMany({ where: { pageId: page.id } });
  const after = updated.map((restriction) => ({
    type: restriction.type,
    userId: restriction.userId,
    role: restriction.role,
  }));

  await createAuditLog({
    actorUserId: req.auth!.userId,
    spaceId: page.spaceId,
    pageId: page.id,
    eventType: 'PAGE_PERMISSION_CHANGED',
    before,
    after,
  });

  res.status(204).send();
});

pagesRouter.get('/space/:spaceKey/pages/:pageIdSlug', requireAuth, async (req, res) => {
  const dashIndex = req.params.pageIdSlug.indexOf('-');
  const pageId = dashIndex >= 0 ? req.params.pageIdSlug.slice(0, dashIndex) : req.params.pageIdSlug;
  const slug = dashIndex >= 0 ? req.params.pageIdSlug.slice(dashIndex + 1) : '';
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: {
      redirects: true,
      space: true,
    },
  });

  if (page?.space.key !== req.params.spaceKey) {
    throw createHttpError(404, 'Page not found');
  }

  if (!(await canViewPageIncludingArchived(req.auth!.userId, page.id))) {
    throw createHttpError(403, 'No access to page');
  }

  const oldSlugMatch = page.redirects.some((redirect) => redirect.oldSlug === slug);
  const needsRedirect = !slug || slug !== page.slug;

  res.json({
    page,
    needsRedirect,
    redirectedFromOldSlug: oldSlugMatch,
    canonicalUrl: `/space/${page.space.key}/pages/${page.id}-${page.slug}`,
  });
});
