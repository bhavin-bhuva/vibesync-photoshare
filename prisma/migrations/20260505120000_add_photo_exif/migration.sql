-- AlterTable
ALTER TABLE "Photo" ADD COLUMN "exifCameraMake"   TEXT,
                    ADD COLUMN "exifCameraModel"   TEXT,
                    ADD COLUMN "exifFocalLength"   DOUBLE PRECISION,
                    ADD COLUMN "exifAperture"      DOUBLE PRECISION,
                    ADD COLUMN "exifShutterSpeed"  TEXT,
                    ADD COLUMN "exifIso"           INTEGER,
                    ADD COLUMN "exifShootDate"     TIMESTAMP(3);
