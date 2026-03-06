import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RestrictionType, SpaceRole } from '../../src/lib/prisma-enums.js';

const mockedPrisma = {
  page: {
    findUnique: vi.fn(),
  },
  spaceMembership: {
    findUnique: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
};

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: mockedPrisma,
}));

describe('permissions.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('evaluates role hierarchy correctly', async () => {
    const { hasAtLeastRole } = await import('../../src/modules/permissions/permissions.service.js');

    expect(hasAtLeastRole(SpaceRole.SPACE_ADMIN, SpaceRole.SPACE_VIEWER)).toBe(true);
    expect(hasAtLeastRole(SpaceRole.SPACE_EDITOR, SpaceRole.SPACE_EDITOR)).toBe(true);
    expect(hasAtLeastRole(SpaceRole.SPACE_VIEWER, SpaceRole.SPACE_EDITOR)).toBe(false);
    expect(hasAtLeastRole(null, SpaceRole.SPACE_VIEWER)).toBe(false);
  });

  it('canViewPage denies archived pages and missing membership', async () => {
    const { canViewPage } = await import('../../src/modules/permissions/permissions.service.js');

    mockedPrisma.page.findUnique.mockResolvedValueOnce({
      id: 'page_1',
      spaceId: 'space_1',
      archived: true,
      restrictions: [],
    });
    expect(await canViewPage('user_1', 'page_1')).toBe(false);

    mockedPrisma.page.findUnique.mockResolvedValueOnce({
      id: 'page_1',
      spaceId: 'space_1',
      archived: false,
      restrictions: [],
    });
    mockedPrisma.spaceMembership.findUnique.mockResolvedValueOnce(null);
    expect(await canViewPage('user_1', 'page_1')).toBe(false);
  });

  it('canViewPage allows unrestricted pages for members', async () => {
    const { canViewPage } = await import('../../src/modules/permissions/permissions.service.js');

    mockedPrisma.page.findUnique.mockResolvedValueOnce({
      id: 'page_1',
      spaceId: 'space_1',
      archived: false,
      restrictions: [],
    });
    mockedPrisma.spaceMembership.findUnique.mockResolvedValueOnce({
      role: SpaceRole.SPACE_VIEWER,
    });

    expect(await canViewPage('user_1', 'page_1')).toBe(true);
  });

  it('canViewPage enforces view restrictions by role or user', async () => {
    const { canViewPage } = await import('../../src/modules/permissions/permissions.service.js');

    mockedPrisma.page.findUnique.mockResolvedValueOnce({
      id: 'page_1',
      spaceId: 'space_1',
      archived: false,
      restrictions: [
        { type: RestrictionType.VIEW, userId: null, role: SpaceRole.SPACE_ADMIN },
        { type: RestrictionType.EDIT, userId: null, role: SpaceRole.SPACE_EDITOR },
      ],
    });
    mockedPrisma.spaceMembership.findUnique.mockResolvedValueOnce({
      role: SpaceRole.SPACE_EDITOR,
    });
    expect(await canViewPage('user_1', 'page_1')).toBe(false);

    mockedPrisma.page.findUnique.mockResolvedValueOnce({
      id: 'page_1',
      spaceId: 'space_1',
      archived: false,
      restrictions: [{ type: RestrictionType.VIEW, userId: 'user_1', role: null }],
    });
    mockedPrisma.spaceMembership.findUnique.mockResolvedValueOnce({
      role: SpaceRole.SPACE_VIEWER,
    });
    expect(await canViewPage('user_1', 'page_1')).toBe(true);
  });

  it('canEditPage requires editor membership and enforces edit restrictions', async () => {
    const { canEditPage } = await import('../../src/modules/permissions/permissions.service.js');

    mockedPrisma.page.findUnique.mockResolvedValueOnce({
      id: 'page_1',
      spaceId: 'space_1',
      archived: false,
      restrictions: [],
    });
    mockedPrisma.spaceMembership.findUnique.mockResolvedValueOnce({
      role: SpaceRole.SPACE_VIEWER,
    });
    expect(await canEditPage('user_1', 'page_1')).toBe(false);

    mockedPrisma.page.findUnique.mockResolvedValueOnce({
      id: 'page_1',
      spaceId: 'space_1',
      archived: false,
      restrictions: [{ type: RestrictionType.EDIT, userId: null, role: SpaceRole.SPACE_ADMIN }],
    });
    mockedPrisma.spaceMembership.findUnique.mockResolvedValueOnce({
      role: SpaceRole.SPACE_EDITOR,
    });
    expect(await canEditPage('user_1', 'page_1')).toBe(false);

    mockedPrisma.page.findUnique.mockResolvedValueOnce({
      id: 'page_1',
      spaceId: 'space_1',
      archived: false,
      restrictions: [{ type: RestrictionType.EDIT, userId: 'user_1', role: null }],
    });
    mockedPrisma.spaceMembership.findUnique.mockResolvedValueOnce({
      role: SpaceRole.SPACE_EDITOR,
    });
    expect(await canEditPage('user_1', 'page_1')).toBe(true);
  });

  it('requireSpaceRole and requireSiteAdmin throw when role is insufficient', async () => {
    const { requireSpaceRole, requireSiteAdmin } = await import('../../src/modules/permissions/permissions.service.js');

    mockedPrisma.spaceMembership.findUnique.mockResolvedValueOnce({
      role: SpaceRole.SPACE_VIEWER,
    });
    await expect(requireSpaceRole('user_1', 'space_1', SpaceRole.SPACE_EDITOR)).rejects.toMatchObject({ status: 403 });

    mockedPrisma.user.findUnique.mockResolvedValueOnce({
      siteRole: 'SITE_USER',
    });
    await expect(requireSiteAdmin('user_1')).rejects.toMatchObject({ status: 403 });
  });
});
