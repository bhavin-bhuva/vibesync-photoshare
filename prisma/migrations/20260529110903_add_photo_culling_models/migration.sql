-- CreateEnum
CREATE TYPE "CullStatus" AS ENUM ('PENDING', 'KEEP', 'REJECT', 'UNSURE');

-- CreateEnum
CREATE TYPE "AutoSuggestion" AS ENUM ('KEEP', 'REJECT', 'REVIEW');

-- CreateEnum
CREATE TYPE "CullingJobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "CullingTrigger" AS ENUM ('AUTO', 'MANUAL');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "cullingEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastCulledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PhotoCullScore" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sharpnessScore" DOUBLE PRECISION,
    "faceSharpnessScore" DOUBLE PRECISION,
    "blinkProbability" DOUBLE PRECISION,
    "leftEyeStatus" TEXT,
    "rightEyeStatus" TEXT,
    "aestheticScore" DOUBLE PRECISION,
    "facesDetected" INTEGER NOT NULL DEFAULT 0,
    "clipEmbedding" BYTEA,
    "burstClusterId" TEXT,
    "isBestInBurst" BOOLEAN NOT NULL DEFAULT false,
    "cullStatus" "CullStatus" NOT NULL DEFAULT 'PENDING',
    "autoSuggestion" "AutoSuggestion",
    "autoSuggestionReason" TEXT,
    "photographerOverride" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhotoCullScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BurstCluster" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "photoCount" INTEGER NOT NULL DEFAULT 0,
    "bestPhotoId" TEXT,
    "averageSimilarity" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BurstCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CullingJob" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "CullingJobStatus" NOT NULL DEFAULT 'PENDING',
    "totalPhotos" INTEGER NOT NULL DEFAULT 0,
    "processedPhotos" INTEGER NOT NULL DEFAULT 0,
    "triggeredBy" "CullingTrigger" NOT NULL DEFAULT 'AUTO',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CullingJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhotoCullScore_photoId_key" ON "PhotoCullScore"("photoId");

-- CreateIndex
CREATE INDEX "PhotoCullScore_eventId_idx" ON "PhotoCullScore"("eventId");

-- CreateIndex
CREATE INDEX "PhotoCullScore_eventId_cullStatus_idx" ON "PhotoCullScore"("eventId", "cullStatus");

-- CreateIndex
CREATE INDEX "PhotoCullScore_eventId_autoSuggestion_idx" ON "PhotoCullScore"("eventId", "autoSuggestion");

-- CreateIndex
CREATE INDEX "PhotoCullScore_burstClusterId_idx" ON "PhotoCullScore"("burstClusterId");

-- CreateIndex
CREATE INDEX "BurstCluster_eventId_idx" ON "BurstCluster"("eventId");

-- CreateIndex
CREATE INDEX "CullingJob_eventId_idx" ON "CullingJob"("eventId");

-- CreateIndex
CREATE INDEX "CullingJob_status_idx" ON "CullingJob"("status");

-- AddForeignKey
ALTER TABLE "PhotoCullScore" ADD CONSTRAINT "PhotoCullScore_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoCullScore" ADD CONSTRAINT "PhotoCullScore_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoCullScore" ADD CONSTRAINT "PhotoCullScore_burstClusterId_fkey" FOREIGN KEY ("burstClusterId") REFERENCES "BurstCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BurstCluster" ADD CONSTRAINT "BurstCluster_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CullingJob" ADD CONSTRAINT "CullingJob_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
