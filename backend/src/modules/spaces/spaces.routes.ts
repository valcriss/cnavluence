import { Router } from 'express';
import createHttpError from 'http-errors';
import { z } from 'zod';
import { SpaceRole } from '../../lib/prisma-enums.js';
import { requireAuth } from '../auth/auth-middleware.js';
import { prisma } from '../../lib/prisma.js';
import { requireSiteAdmin, requireSpaceRole } from '../permissions/permissions.service.js';
import { createAuditLog } from '../audit/audit-log.service.js';
import { slugify } from '../../lib/slug.js';

const createSpaceSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional().default(''),
  ownerUserId: z.string().cuid(),
});

const updateSpaceSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional().default(''),
  ownerUserIds: z.array(z.string().cuid()).min(1),
});

const membershipSchema = z.object({
  userId: z.string().cuid(),
  role: z.nativeEnum(SpaceRole),
});

const listAdminCollectionsSchema = z.object({
  archived: z.coerce.boolean().default(false),
});

const archiveSpaceSchema = z.object({
  confirmName: z.string().optional(),
});

const permanentDeleteSpaceSchema = z.object({
  confirmName: z.string().min(1),
});

export const spacesRouter = Router();
const PERSONAL_TAG = 'Personnel';

const mapSpaceCollection = (space: {
  id: string;
  key: string;
  name: string;
  description: string;
  archivedAt: Date | null;
  isPersonal: boolean;
  personalOwnerUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { pages: number };
  memberships: Array<{
    userId: string;
    role: string;
    user: { id: string; email: string; displayName: string };
  }>;
}) => {
  const owners = space.memberships
    .filter((membership) => membership.role === SpaceRole.SPACE_ADMIN)
    .map((membership) => ({
      id: membership.user.id,
      email: membership.user.email,
      displayName: membership.user.displayName,
    }));

  return {
    id: space.id,
    key: space.key,
    name: space.name,
    description: space.description,
    archivedAt: space.archivedAt,
    isPersonal: space.isPersonal,
    tag: space.isPersonal ? PERSONAL_TAG : null,
    personalOwnerUserId: space.personalOwnerUserId,
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
    pageCount: space._count.pages,
    owners,
  };
};

const createUniqueSpaceKey = async (name: string): Promise<string> => {
  const base = slugify(name).slice(0, 40) || 'space';

  let candidate = base;
  let suffix = 2;

  for (;;) {
    const existing = await prisma.space.findUnique({
      where: { key: candidate },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }

    const suffixText = `-${suffix}`;
    candidate = `${base.slice(0, Math.max(1, 40 - suffixText.length))}${suffixText}`;
    suffix += 1;
  }
};

spacesRouter.get('/', requireAuth, async (req, res) => {
  const memberships = await prisma.spaceMembership.findMany({
    where: {
      userId: req.auth!.userId,
      space: {
        archivedAt: null,
      },
    },
    include: { space: true },
    orderBy: { space: { name: 'asc' } },
  });

  res.json({
    spaces: memberships.map((membership: { space: Record<string, unknown>; role: string }) => ({
      ...membership.space,
      role: membership.role,
      tag: (membership.space as { isPersonal?: boolean }).isPersonal ? PERSONAL_TAG : null,
    })),
  });
});

spacesRouter.get('/admin/collections', requireAuth, async (req, res) => {
  await requireSiteAdmin(req.auth!.userId);
  const query = listAdminCollectionsSchema.parse(req.query);

  const spaces = await prisma.space.findMany({
    where: query.archived ? { archivedAt: { not: null } } : { archivedAt: null },
    include: {
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      },
      _count: {
        select: { pages: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  res.json({
    spaces: spaces.map(mapSpaceCollection),
  });
});

spacesRouter.get('/admin/users', requireAuth, async (req, res) => {
  await requireSiteAdmin(req.auth!.userId);

  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      email: true,
      displayName: true,
      siteRole: true,
      createdAt: true,
    },
    orderBy: { displayName: 'asc' },
  });

  res.json({ users });
});

spacesRouter.post('/', requireAuth, async (req, res) => {
  const payload = createSpaceSchema.parse(req.body);
  await requireSiteAdmin(req.auth!.userId);

  const owner = await prisma.user.findUnique({
    where: { id: payload.ownerUserId },
    select: { id: true },
  });

  if (!owner) {
    throw createHttpError(400, 'Owner user not found');
  }

  const key = await createUniqueSpaceKey(payload.name);
  const ownerIds = new Set([payload.ownerUserId, req.auth!.userId]);

  const space = await prisma.space.create({
    data: {
      key,
      name: payload.name,
      description: payload.description,
      isPersonal: false,
      personalOwnerUserId: null,
      memberships: {
        create: [...ownerIds].map((userId) => ({
          userId,
          role: SpaceRole.SPACE_ADMIN,
        })),
      },
    },
    include: {
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      },
      _count: {
        select: { pages: true },
      },
    },
  });

  await createAuditLog({
    actorUserId: req.auth!.userId,
    spaceId: space.id,
    eventType: 'SPACE_CREATED',
    after: {
      key: space.key,
      name: space.name,
      description: space.description,
      ownerUserIds: [...ownerIds],
    },
  });

  res.status(201).json({ space: mapSpaceCollection(space) });
});

spacesRouter.patch('/:spaceId', requireAuth, async (req, res) => {
  const payload = updateSpaceSchema.parse(req.body);
  const spaceId = String(req.params.spaceId);

  await requireSiteAdmin(req.auth!.userId);

  const userCount = await prisma.user.count({
    where: {
      id: {
        in: payload.ownerUserIds,
      },
    },
  });

  if (userCount !== payload.ownerUserIds.length) {
    throw createHttpError(400, 'One or more owners were not found');
  }

  const before = await prisma.space.findUniqueOrThrow({
    where: { id: spaceId },
    include: {
      personalOwner: {
        select: {
          id: true,
          displayName: true,
        },
      },
      memberships: {
        where: { role: SpaceRole.SPACE_ADMIN },
        select: { userId: true },
      },
    },
  });

  if (before.isPersonal) {
    if (!before.personalOwnerUserId) {
      throw createHttpError(400, 'Invalid personal space owner');
    }

    if (payload.ownerUserIds.length !== 1 || payload.ownerUserIds[0] !== before.personalOwnerUserId) {
      throw createHttpError(400, 'Personal spaces must keep exactly one owner');
    }
  }

  const ownerIds = [...new Set(payload.ownerUserIds)];

  const ownerUpserts = ownerIds.map((ownerUserId) =>
    prisma.spaceMembership.upsert({
      where: {
        userId_spaceId: {
          userId: ownerUserId,
          spaceId,
        },
      },
      update: {
        role: SpaceRole.SPACE_ADMIN,
      },
      create: {
        userId: ownerUserId,
        spaceId,
        role: SpaceRole.SPACE_ADMIN,
      },
    }),
  );

  await prisma.$transaction([
    prisma.spaceMembership.deleteMany({
      where: {
        spaceId,
        role: SpaceRole.SPACE_ADMIN,
        userId: { notIn: ownerIds },
      },
    }),
    ...ownerUpserts,
    prisma.space.update({
      where: { id: spaceId },
      data: {
        name: payload.name,
        description: payload.description,
      },
    }),
  ]);

  const space = await prisma.space.findUniqueOrThrow({
    where: { id: spaceId },
    include: {
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      },
      _count: {
        select: { pages: true },
      },
    },
  });

  await createAuditLog({
    actorUserId: req.auth!.userId,
    spaceId,
    eventType: 'SPACE_ROLE_CHANGED',
    before: {
      name: before.name,
      description: before.description,
      ownerUserIds: before.memberships.map((membership: { userId: string }) => membership.userId),
    },
    after: {
      name: space.name,
      description: space.description,
      ownerUserIds: ownerIds,
    },
  });

  res.json({ space: mapSpaceCollection(space) });
});

spacesRouter.post('/admin/collections/:spaceId/archive', requireAuth, async (req, res) => {
  await requireSiteAdmin(req.auth!.userId);
  const spaceId = String(req.params.spaceId);
  const payload = archiveSpaceSchema.parse(req.body ?? {});

  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: {
      id: true,
      name: true,
      archivedAt: true,
      isPersonal: true,
      _count: {
        select: { pages: true },
      },
    },
  });

  if (!space) {
    throw createHttpError(404, 'Space not found');
  }

  if (space.archivedAt) {
    res.json({ archived: true });
    return;
  }

  if (space.isPersonal) {
    throw createHttpError(400, 'Personal spaces cannot be archived');
  }

  if (space._count.pages > 0 && payload.confirmName !== space.name) {
    throw createHttpError(400, 'Archive confirmation failed');
  }

  await prisma.space.update({
    where: { id: spaceId },
    data: { archivedAt: new Date() },
  });

  res.json({ archived: true });
});

spacesRouter.post('/admin/collections/:spaceId/restore', requireAuth, async (req, res) => {
  await requireSiteAdmin(req.auth!.userId);
  const spaceId = String(req.params.spaceId);

  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: { id: true, archivedAt: true },
  });

  if (!space) {
    throw createHttpError(404, 'Space not found');
  }

  if (!space.archivedAt) {
    res.json({ restored: true });
    return;
  }

  await prisma.space.update({
    where: { id: spaceId },
    data: { archivedAt: null },
  });

  res.json({ restored: true });
});

spacesRouter.delete('/admin/collections/:spaceId/permanent', requireAuth, async (req, res) => {
  await requireSiteAdmin(req.auth!.userId);
  const spaceId = String(req.params.spaceId);
  const payload = permanentDeleteSpaceSchema.parse(req.body ?? {});

  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: {
      id: true,
      name: true,
      archivedAt: true,
      isPersonal: true,
    },
  });

  if (!space) {
    throw createHttpError(404, 'Space not found');
  }

  if (!space.archivedAt) {
    throw createHttpError(400, 'Space must be archived before permanent deletion');
  }

  if (space.isPersonal) {
    throw createHttpError(400, 'Personal spaces cannot be deleted manually');
  }

  if (payload.confirmName !== space.name) {
    throw createHttpError(400, 'Delete confirmation failed');
  }

  await prisma.space.delete({
    where: { id: spaceId },
  });

  res.status(204).send();
});

spacesRouter.put('/:spaceId/members/:userId', requireAuth, async (req, res) => {
  const spaceId = String(req.params.spaceId);
  const userId = String(req.params.userId);
  const payload = membershipSchema.parse({
    userId,
    role: req.body.role,
  });

  await requireSpaceRole(req.auth!.userId, spaceId, SpaceRole.SPACE_ADMIN);

  const membership = await prisma.spaceMembership.upsert({
    where: {
      userId_spaceId: {
        userId: payload.userId,
        spaceId,
      },
    },
    update: {
      role: payload.role,
    },
    create: {
      userId: payload.userId,
      spaceId,
      role: payload.role,
    },
  });

  await createAuditLog({
    actorUserId: req.auth!.userId,
    spaceId,
    eventType: 'SPACE_ROLE_CHANGED',
    after: membership,
  });

  res.json({ membership });
});
