-- CreateEnum
CREATE TYPE "PhotoStatus" AS ENUM ('UPLOADING', 'READY');

-- AlterTable
ALTER TABLE "Photo"
  ADD COLUMN "status" "PhotoStatus" NOT NULL DEFAULT 'READY',
  ADD COLUMN "width"  INTEGER,
  ADD COLUMN "height" INTEGER;
