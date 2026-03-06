-- AlterTable
ALTER TABLE "Space"
ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Space_archivedAt_idx" ON "Space"("archivedAt");
