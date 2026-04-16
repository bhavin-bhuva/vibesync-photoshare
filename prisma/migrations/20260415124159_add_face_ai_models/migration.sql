-- CreateEnum
CREATE TYPE "FaceJobStatus" AS ENUM ('PENDING', 'RUNNING', 'CLUSTERING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "FaceSearchStatus" AS ENUM ('PENDING', 'SEARCHING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "faceIndexingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SharedLink" ADD COLUMN     "faceSearchEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "FaceRecord" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "faceClusterId" TEXT,
    "faceIndex" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "boundingBoxX1" DOUBLE PRECISION NOT NULL,
    "boundingBoxY1" DOUBLE PRECISION NOT NULL,
    "boundingBoxX2" DOUBLE PRECISION NOT NULL,
    "boundingBoxY2" DOUBLE PRECISION NOT NULL,
    "cropS3Key" TEXT NOT NULL,
    "embedding" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaceCluster" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "label" TEXT,
    "coverCropS3Key" TEXT NOT NULL,
    "photoCount" INTEGER NOT NULL DEFAULT 0,
    "faceCount" INTEGER NOT NULL DEFAULT 0,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaceCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaceIndexingJob" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "FaceJobStatus" NOT NULL DEFAULT 'PENDING',
    "totalPhotos" INTEGER NOT NULL DEFAULT 0,
    "processedPhotos" INTEGER NOT NULL DEFAULT 0,
    "facesFound" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaceIndexingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaceSearchSession" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "selfieS3Key" TEXT,
    "matchedPhotoIds" JSONB NOT NULL DEFAULT '[]',
    "matchedClusterIds" JSONB NOT NULL DEFAULT '[]',
    "status" "FaceSearchStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaceSearchSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FaceRecord_photoId_idx" ON "FaceRecord"("photoId");

-- CreateIndex
CREATE INDEX "FaceRecord_eventId_idx" ON "FaceRecord"("eventId");

-- CreateIndex
CREATE INDEX "FaceRecord_faceClusterId_idx" ON "FaceRecord"("faceClusterId");

-- CreateIndex
CREATE INDEX "FaceCluster_eventId_idx" ON "FaceCluster"("eventId");

-- CreateIndex
CREATE INDEX "FaceIndexingJob_eventId_idx" ON "FaceIndexingJob"("eventId");

-- CreateIndex
CREATE INDEX "FaceIndexingJob_status_idx" ON "FaceIndexingJob"("status");

-- CreateIndex
CREATE INDEX "FaceSearchSession_slug_idx" ON "FaceSearchSession"("slug");

-- AddForeignKey
ALTER TABLE "FaceRecord" ADD CONSTRAINT "FaceRecord_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaceRecord" ADD CONSTRAINT "FaceRecord_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaceRecord" ADD CONSTRAINT "FaceRecord_faceClusterId_fkey" FOREIGN KEY ("faceClusterId") REFERENCES "FaceCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaceCluster" ADD CONSTRAINT "FaceCluster_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaceIndexingJob" ADD CONSTRAINT "FaceIndexingJob_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
