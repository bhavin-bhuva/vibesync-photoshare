/*
  Warnings:

  - You are about to drop the column `customThemeData` on the `SharedLink` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "customThemeData" JSONB;

-- AlterTable
ALTER TABLE "SharedLink" DROP COLUMN "customThemeData";
