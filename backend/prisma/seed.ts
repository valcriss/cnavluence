import bcrypt from 'bcryptjs';
import { PrismaClient, SpaceRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@cnavluence.local';
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash('admin1234', 10);

  const user = await prisma.user.upsert({
    where: { normalizedEmail },
    update: { siteRole: 'SITE_ADMIN' },
    create: {
      email,
      normalizedEmail,
      displayName: 'Admin',
      passwordHash,
      siteRole: 'SITE_ADMIN',
      identities: {
        create: {
          provider: 'LOCAL',
          subject: normalizedEmail,
        },
      },
    },
  });

  const space = await prisma.space.upsert({
    where: { key: 'ENG' },
    update: {},
    create: {
      key: 'ENG',
      name: 'Engineering',
    },
  });

  await prisma.spaceMembership.upsert({
    where: {
      userId_spaceId: {
        userId: user.id,
        spaceId: space.id,
      },
    },
    update: { role: SpaceRole.SPACE_ADMIN },
    create: {
      userId: user.id,
      spaceId: space.id,
      role: SpaceRole.SPACE_ADMIN,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
