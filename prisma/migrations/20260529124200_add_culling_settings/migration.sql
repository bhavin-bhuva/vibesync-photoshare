-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "autoCullOnUpload" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cullingSensitivity" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN     "rejectBurstDups" BOOLEAN NOT NULL DEFAULT false;
