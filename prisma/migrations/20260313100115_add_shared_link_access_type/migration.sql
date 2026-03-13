-- CreateEnum
CREATE TYPE "SharedLinkAccessType" AS ENUM ('PASSWORD', 'PIN', 'NONE');

-- AlterTable
ALTER TABLE "SharedLink" ADD COLUMN     "accessType" "SharedLinkAccessType" NOT NULL DEFAULT 'PASSWORD',
ADD COLUMN     "pin" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;
