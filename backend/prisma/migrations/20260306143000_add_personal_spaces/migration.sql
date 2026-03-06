-- AlterTable
ALTER TABLE "Space"
ADD COLUMN "isPersonal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "personalOwnerUserId" TEXT;

-- CreateIndex
CREATE INDEX "Space_isPersonal_idx" ON "Space"("isPersonal");

-- CreateIndex
CREATE UNIQUE INDEX "Space_personalOwnerUserId_key" ON "Space"("personalOwnerUserId");

-- AddForeignKey
ALTER TABLE "Space"
ADD CONSTRAINT "Space_personalOwnerUserId_fkey"
FOREIGN KEY ("personalOwnerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
