-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "gallerySubtitle" TEXT,
ADD COLUMN     "galleryTitle" TEXT,
ADD COLUMN     "introAnimation" TEXT NOT NULL DEFAULT 'fade',
ADD COLUMN     "showEventDate" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showPhotoCount" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "theme" TEXT NOT NULL DEFAULT 'minimal',
ADD COLUMN     "welcomeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "welcomeHeroPhotoId" TEXT,
ADD COLUMN     "welcomeMessage" TEXT;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_welcomeHeroPhotoId_fkey" FOREIGN KEY ("welcomeHeroPhotoId") REFERENCES "Photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
