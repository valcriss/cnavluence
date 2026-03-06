import { prisma } from '../../lib/prisma.js';
import { SpaceRole } from '../../lib/prisma-enums.js';
import { slugify } from '../../lib/slug.js';

const sanitizeLocalPart = (email: string): string => {
  const [localPart = 'user'] = email.trim().toLowerCase().split('@');
  const sanitized = slugify(localPart).slice(0, 40);
  return sanitized || 'user';
};

const createUniqueKey = async (base: string, excludeSpaceId?: string): Promise<string> => {
  let candidate = base;
  let suffix = 2;

  for (;;) {
    const existing = await prisma.space.findUnique({
      where: { key: candidate },
      select: { id: true },
    });

    if (!existing || existing.id === excludeSpaceId) {
      return candidate;
    }

    const suffixText = `-${suffix}`;
    candidate = `${base.slice(0, Math.max(1, 40 - suffixText.length))}${suffixText}`;
    suffix += 1;
  }
};

export async function ensurePersonalSpaceForUser(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      normalizedEmail: true,
      displayName: true,
    },
  });

  if (!user) {
    return;
  }

  const baseKey = sanitizeLocalPart(user.normalizedEmail);
  const existing = await prisma.space.findUnique({
    where: { personalOwnerUserId: user.id },
    select: {
      id: true,
      key: true,
      name: true,
      isPersonal: true,
      archivedAt: true,
      personalOwnerUserId: true,
    },
  });

  const key = await createUniqueKey(baseKey, existing?.id);

  if (!existing) {
    await prisma.space.create({
      data: {
        key,
        name: user.displayName,
        isPersonal: true,
        personalOwnerUserId: user.id,
        memberships: {
          create: {
            userId: user.id,
            role: SpaceRole.SPACE_ADMIN,
          },
        },
      },
    });
    return;
  }

  await prisma.$transaction([
    prisma.space.update({
      where: { id: existing.id },
      data: {
        key,
        name: user.displayName,
        isPersonal: true,
        personalOwnerUserId: user.id,
        archivedAt: null,
      },
    }),
    prisma.spaceMembership.deleteMany({
      where: {
        spaceId: existing.id,
        role: SpaceRole.SPACE_ADMIN,
        userId: { not: user.id },
      },
    }),
    prisma.spaceMembership.upsert({
      where: {
        userId_spaceId: {
          userId: user.id,
          spaceId: existing.id,
        },
      },
      update: {
        role: SpaceRole.SPACE_ADMIN,
      },
      create: {
        userId: user.id,
        spaceId: existing.id,
        role: SpaceRole.SPACE_ADMIN,
      },
    }),
  ]);
}
