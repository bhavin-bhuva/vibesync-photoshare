-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "watermarkEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "watermarkOpacity" INTEGER NOT NULL DEFAULT 55,
ADD COLUMN     "watermarkOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "watermarkPosition" TEXT NOT NULL DEFAULT 'BOTTOM_RIGHT',
ADD COLUMN     "watermarkSource" TEXT NOT NULL DEFAULT 'logo';
