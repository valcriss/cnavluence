import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockedPrisma = {
  user: {
    findUnique: vi.fn(),
  },
  space: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  spaceMembership: {
    deleteMany: vi.fn(),
    upsert: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: mockedPrisma,
}));

describe('ensurePersonalSpaceForUser', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedPrisma.$transaction.mockResolvedValue(undefined);
    mockedPrisma.space.create.mockResolvedValue({ id: 'space_created' });
    mockedPrisma.space.update.mockResolvedValue({ id: 'space_existing' });
    mockedPrisma.spaceMembership.deleteMany.mockResolvedValue({ count: 1 });
    mockedPrisma.spaceMembership.upsert.mockResolvedValue({ userId: 'user_1', spaceId: 'space_existing', role: 'SPACE_ADMIN' });
  });

  it('creates personal space when absent with auto-suffixed unique key', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      normalizedEmail: 'daniel@example.com',
      displayName: 'Daniel Silvestre',
    });

    mockedPrisma.space.findUnique.mockImplementation(async ({ where }: { where: { personalOwnerUserId?: string; key?: string } }) => {
      if (where.personalOwnerUserId) {
        return null;
      }
      if (where.key === 'daniel') {
        return { id: 'space_taken' };
      }
      if (where.key === 'daniel-2') {
        return null;
      }
      return null;
    });

    const { ensurePersonalSpaceForUser } = await import('../../src/modules/spaces/personal-space.service.js');
    await ensurePersonalSpaceForUser('user_1');

    expect(mockedPrisma.space.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key: 'daniel-2',
          name: 'Daniel Silvestre',
          isPersonal: true,
          personalOwnerUserId: 'user_1',
        }),
      }),
    );
  });

  it('repairs existing personal space and keeps only one owner admin', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      normalizedEmail: 'daniel@example.com',
      displayName: 'Daniel Silvestre',
    });

    mockedPrisma.space.findUnique.mockImplementation(async ({ where }: { where: { personalOwnerUserId?: string; key?: string } }) => {
      if (where.personalOwnerUserId) {
        return {
          id: 'space_existing',
          key: 'old-key',
          name: 'Old Name',
          isPersonal: true,
          archivedAt: new Date('2026-03-01T00:00:00.000Z'),
          personalOwnerUserId: 'user_1',
        };
      }
      if (where.key === 'daniel') {
        return null;
      }
      return null;
    });

    const { ensurePersonalSpaceForUser } = await import('../../src/modules/spaces/personal-space.service.js');
    await ensurePersonalSpaceForUser('user_1');

    expect(mockedPrisma.space.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'space_existing' },
        data: expect.objectContaining({
          key: 'daniel',
          name: 'Daniel Silvestre',
          isPersonal: true,
          personalOwnerUserId: 'user_1',
          archivedAt: null,
        }),
      }),
    );

    expect(mockedPrisma.spaceMembership.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          spaceId: 'space_existing',
          userId: { not: 'user_1' },
        }),
      }),
    );
    expect(mockedPrisma.spaceMembership.upsert).toHaveBeenCalled();
    expect(mockedPrisma.$transaction).toHaveBeenCalled();
  });
});
