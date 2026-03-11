-- CreateTable
CREATE TABLE "StudioProfile" (
    "id" TEXT NOT NULL,
    "studioName" TEXT NOT NULL,
    "logoS3Key" TEXT,
    "tagline" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "brandColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "StudioProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudioProfile_userId_key" ON "StudioProfile"("userId");

-- AddForeignKey
ALTER TABLE "StudioProfile" ADD CONSTRAINT "StudioProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
