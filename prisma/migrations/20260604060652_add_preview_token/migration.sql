-- CreateTable
CREATE TABLE "PreviewToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "sharedLinkId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreviewToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreviewToken_token_key" ON "PreviewToken"("token");

-- CreateIndex
CREATE INDEX "PreviewToken_token_idx" ON "PreviewToken"("token");

-- AddForeignKey
ALTER TABLE "PreviewToken" ADD CONSTRAINT "PreviewToken_sharedLinkId_fkey" FOREIGN KEY ("sharedLinkId") REFERENCES "SharedLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
