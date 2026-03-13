-- CreateTable
CREATE TABLE "GalleryAccessAttempt" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryAccessAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GalleryAccessAttempt_slug_attemptedAt_idx" ON "GalleryAccessAttempt"("slug", "attemptedAt");
