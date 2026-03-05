import createHttpError from 'http-errors';
import { SpaceRole, RestrictionType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export async function getUserSpaceRole(userId: string, spaceId: string): Promise<SpaceRole | null> {
  const membership = await prisma.spaceMembership.findUnique({
    where: {
      userId_spaceId: { userId, spaceId },
    },
  });
  return membership?.role ?? null;
}

const roleRank: Record<SpaceRole, number> = {
  SPACE_VIEWER: 1,
  SPACE_EDITOR: 2,
  SPACE_ADMIN: 3,
};

export function hasAtLeastRole(role: SpaceRole | null, minimum: SpaceRole): boolean {
  if (!role) {
    return false;
  }
  return roleRank[role] >= roleRank[minimum];
}

export async function canViewPage(userId: string, pageId: string): Promise<boolean> {
  return canViewPageWithArchiveOption(userId, pageId, false);
}

export async function canViewPageIncludingArchived(userId: string, pageId: string): Promise<boolean> {
  return canViewPageWithArchiveOption(userId, pageId, true);
}

async function canViewPageWithArchiveOption(userId: string, pageId: string, allowArchived: boolean): Promise<boolean> {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: { restrictions: true },
  });
  if (!page || (!allowArchived && page.archived)) {
    return false;
  }

  const role = await getUserSpaceRole(userId, page.spaceId);
  if (!role) {
    return false;
  }

  const viewRestrictions = page.restrictions.filter((restriction) => restriction.type === RestrictionType.VIEW);
  if (!viewRestrictions.length) {
    return true;
  }

  return viewRestrictions.some(
    (restriction) => restriction.userId === userId || (restriction.role && hasAtLeastRole(role, restriction.role)),
  );
}

export async function canEditPage(userId: string, pageId: string): Promise<boolean> {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: { restrictions: true },
  });
  if (!page || page.archived) {
    return false;
  }

  const role = await getUserSpaceRole(userId, page.spaceId);
  if (!hasAtLeastRole(role, SpaceRole.SPACE_EDITOR)) {
    return false;
  }

  const editRestrictions = page.restrictions.filter((restriction) => restriction.type === RestrictionType.EDIT);
  if (!editRestrictions.length) {
    return true;
  }

  return editRestrictions.some(
    (restriction) => restriction.userId === userId || (restriction.role && hasAtLeastRole(role, restriction.role)),
  );
}

export async function requireSpaceRole(userId: string, spaceId: string, minimumRole: SpaceRole): Promise<void> {
  const role = await getUserSpaceRole(userId, spaceId);
  if (!hasAtLeastRole(role, minimumRole)) {
    throw createHttpError(403, 'Insufficient space permissions');
  }
}

export async function requireSiteAdmin(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { siteRole: true },
  });

  if (!user || user.siteRole !== 'SITE_ADMIN') {
    throw createHttpError(403, 'SITE_ADMIN role required');
  }
}
