-- CreateEnum
CREATE TYPE "WatermarkPosition" AS ENUM ('BOTTOM_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_CENTER');

-- AlterTable
ALTER TABLE "StudioProfile" ADD COLUMN     "watermarkEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "watermarkOpacity" INTEGER NOT NULL DEFAULT 55,
ADD COLUMN     "watermarkPosition" "WatermarkPosition" NOT NULL DEFAULT 'BOTTOM_RIGHT';
