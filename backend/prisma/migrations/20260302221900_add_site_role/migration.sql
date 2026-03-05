-- CreateEnum
CREATE TYPE "SiteRole" AS ENUM ('SITE_ADMIN', 'SITE_USER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "siteRole" "SiteRole" NOT NULL DEFAULT 'SITE_USER';
