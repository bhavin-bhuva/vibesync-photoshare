/**
 * Backfills EXIF data (and corrected dimensions) for all existing photos
 * that have null exifCameraMake. Fetches each photo from S3 via sharp,
 * extracts EXIF, and writes the fields to the Photo record.
 *
 * Usage:
 *   npm run exif:backfill
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { parseExifBuffer } from "../src/lib/exif";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET_NAME!;
const CONCURRENCY = 5;

async function fetchBuffer(s3Key: string): Promise<Buffer> {
  const { Body } = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }));
  const chunks: Buffer[] = [];
  for await (const chunk of Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function processPhoto(photo: { id: string; s3Key: string }): Promise<void> {
  try {
    const buf = await fetchBuffer(photo.s3Key);
    const meta = await sharp(buf).metadata();

    let width: number | null = meta.width ?? null;
    let height: number | null = meta.height ?? null;
    if (meta.orientation && meta.orientation >= 5 && meta.orientation <= 8) {
      [width, height] = [height, width];
    }

    const exif = meta.exif ? parseExifBuffer(meta.exif as Buffer) : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.photo.update as any)({
      where: { id: photo.id },
      data: {
        width,
        height,
        exifCameraMake:   exif?.exifCameraMake   ?? null,
        exifCameraModel:  exif?.exifCameraModel  ?? null,
        exifFocalLength:  exif?.exifFocalLength  ?? null,
        exifAperture:     exif?.exifAperture     ?? null,
        exifShutterSpeed: exif?.exifShutterSpeed ?? null,
        exifIso:          exif?.exifIso          ?? null,
        exifShootDate:    exif?.exifShootDate    ?? null,
      },
    });
    process.stdout.write(".");
  } catch (err) {
    console.error(`\n[backfill-exif] Failed for photo ${photo.id}: ${(err as Error).message}`);
  }
}

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const photos = await (db.photo.findMany as any)({
    where: { exifCameraMake: null },
    select: { id: true, s3Key: true },
    orderBy: { createdAt: "asc" },
  }) as { id: string; s3Key: string }[];

  console.log(`Found ${photos.length} photos to backfill.`);
  if (photos.length === 0) {
    await db.$disconnect();
    return;
  }

  // Process in batches of CONCURRENCY
  for (let i = 0; i < photos.length; i += CONCURRENCY) {
    const batch = photos.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(processPhoto));
  }

  console.log(`\nDone. Processed ${photos.length} photos.`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
