-- CreateEnum
CREATE TYPE "SelectionStatus" AS ENUM ('PENDING', 'REVIEWED', 'DELIVERED');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "hasNewSelections" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PhotoSelection" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerNote" TEXT,
    "status" "SelectionStatus" NOT NULL DEFAULT 'PENDING',
    "sharedLinkId" TEXT NOT NULL,

    CONSTRAINT "PhotoSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelectedPhoto" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "photoSelectionId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,

    CONSTRAINT "SelectedPhoto_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PhotoSelection" ADD CONSTRAINT "PhotoSelection_sharedLinkId_fkey" FOREIGN KEY ("sharedLinkId") REFERENCES "SharedLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectedPhoto" ADD CONSTRAINT "SelectedPhoto_photoSelectionId_fkey" FOREIGN KEY ("photoSelectionId") REFERENCES "PhotoSelection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectedPhoto" ADD CONSTRAINT "SelectedPhoto_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
