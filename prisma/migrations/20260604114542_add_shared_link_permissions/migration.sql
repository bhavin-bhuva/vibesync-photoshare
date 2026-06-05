-- AlterTable
ALTER TABLE "SharedLink" ADD COLUMN     "downloadsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "selectionEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "zipDownloadEnabled" BOOLEAN NOT NULL DEFAULT true;
