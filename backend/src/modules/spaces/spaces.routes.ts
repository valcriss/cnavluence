import { Router } from 'express';
import { z } from 'zod';
import { SpaceRole } from '../../lib/prisma-enums.js';
import { requireAuth } from '../auth/auth-middleware.js';
import { prisma } from '../../lib/prisma.js';
import { requireSiteAdmin, requireSpaceRole } from '../permissions/permissions.service.js';
import { createAuditLog } from '../audit/audit-log.service.js';

const createSpaceSchema = z.object({
  key: z.string().min(2).max(12).regex(/^[A-Z0-9_]+$/),
  name: z.string().min(2).max(120),
});

const updateSpaceSchema = z.object({
  name: z.string().min(2).max(120),
});

const membershipSchema = z.object({
  userId: z.string().cuid(),
  role: z.nativeEnum(SpaceRole),
});

export const spacesRouter = Router();

spacesRouter.get('/', requireAuth, async (req, res) => {
  const memberships = await prisma.spaceMembership.findMany({
    where: { userId: req.auth!.userId },
    include: { space: true },
    orderBy: { space: { name: 'asc' } },
  });

  res.json({
    spaces: memberships.map((membership) => ({
      ...membership.space,
      role: membership.role,
    })),
  });
});

spacesRouter.post('/', requireAuth, async (req, res) => {
  const payload = createSpaceSchema.parse(req.body);
  await requireSiteAdmin(req.auth!.userId);

  const space = await prisma.space.create({
    data: {
      key: payload.key,
      name: payload.name,
      memberships: {
        create: {
          userId: req.auth!.userId,
          role: SpaceRole.SPACE_ADMIN,
        },
      },
    },
  });

  await createAuditLog({
    actorUserId: req.auth!.userId,
    spaceId: space.id,
    eventType: 'SPACE_CREATED',
    after: { key: space.key, name: space.name },
  });

  res.status(201).json({ space });
});

spacesRouter.patch('/:spaceId', requireAuth, async (req, res) => {
  const payload = updateSpaceSchema.parse(req.body);
  const { spaceId } = req.params;

  await requireSpaceRole(req.auth!.userId, spaceId, SpaceRole.SPACE_ADMIN);

  const before = await prisma.space.findUniqueOrThrow({ where: { id: spaceId } });
  const space = await prisma.space.update({
    where: { id: spaceId },
    data: { name: payload.name },
  });

  await createAuditLog({
    actorUserId: req.auth!.userId,
    spaceId,
    eventType: 'SPACE_ROLE_CHANGED',
    before: { name: before.name },
    after: { name: space.name },
  });

  res.json({ space });
});

spacesRouter.put('/:spaceId/members/:userId', requireAuth, async (req, res) => {
  const payload = membershipSchema.parse({
    userId: req.params.userId,
    role: req.body.role,
  });

  await requireSpaceRole(req.auth!.userId, req.params.spaceId, SpaceRole.SPACE_ADMIN);

  const membership = await prisma.spaceMembership.upsert({
    where: {
      userId_spaceId: {
        userId: payload.userId,
        spaceId: req.params.spaceId,
      },
    },
    update: {
      role: payload.role,
    },
    create: {
      userId: payload.userId,
      spaceId: req.params.spaceId,
      role: payload.role,
    },
  });

  await createAuditLog({
    actorUserId: req.auth!.userId,
    spaceId: req.params.spaceId,
    eventType: 'SPACE_ROLE_CHANGED',
    after: membership,
  });

  res.json({ membership });
});
