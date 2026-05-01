-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "groupId" TEXT;

-- CreateTable
CREATE TABLE "PhotoGroup" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT DEFAULT '#6366f1',
    "coverPhotoId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "photoCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhotoGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PhotoGroup_eventId_idx" ON "PhotoGroup"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoGroup_eventId_name_key" ON "PhotoGroup"("eventId", "name");

-- CreateIndex
CREATE INDEX "Photo_groupId_idx" ON "Photo"("groupId");

-- CreateIndex
CREATE INDEX "Photo_eventId_groupId_idx" ON "Photo"("eventId", "groupId");

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PhotoGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoGroup" ADD CONSTRAINT "PhotoGroup_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
