import { prisma } from '../lib/prisma.js';

async function main() {
  const rawEmail = process.argv[2];
  if (!rawEmail) {
    throw new Error('Usage: npm run grant:site-admin -- <email>');
  }

  const normalizedEmail = rawEmail.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error('Email must not be empty');
  }

  const updated = await prisma.user.update({
    where: { normalizedEmail },
    data: { siteRole: 'SITE_ADMIN' },
    select: {
      id: true,
      email: true,
      displayName: true,
      siteRole: true,
    },
  });

  console.log(`Updated ${updated.email} (${updated.displayName}) to ${updated.siteRole}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
