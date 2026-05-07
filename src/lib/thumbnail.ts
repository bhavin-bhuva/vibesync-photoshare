import sharp from "sharp";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

// Standalone S3 client — not imported from s3.ts which is "use server"
const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

/**
 * Derives the thumbnail S3 key from the original key.
 * Example: "photographers/u1/events/e1/1234-photo.jpg"
 *       → "photographers/u1/events/e1/thumbs/1234-photo-thumb.jpg"
 */
export function thumbKeyFor(s3Key: string): string {
  const parts = s3Key.split("/");
  const filename = parts[parts.length - 1];
  const dir = parts.slice(0, -1).join("/");
  const baseName = filename.replace(/\.[^.]+$/, "");
  return `${dir}/thumbs/${baseName}-thumb.jpg`;
}

export interface ThumbnailResult {
  thumbKey: string;
  width: number | null;
  height: number | null;
  exifBuffer: Buffer | null;
}

/**
 * Fetches the original from S3, resizes to 800 px wide (JPEG q80),
 * uploads the thumbnail to S3, and returns the thumb key plus image metadata.
 *
 * Throws on any error — callers should handle failures as best-effort.
 */
export async function createThumbnail(s3Key: string): Promise<ThumbnailResult> {
  const bucket = process.env.AWS_S3_BUCKET_NAME!;

  const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: s3Key }));

  const chunks: Buffer[] = [];
  for await (const chunk of Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  const original = Buffer.concat(chunks);

  // Extract metadata before rotation (exif buffer is stripped by .rotate())
  const meta = await sharp(original).metadata();
  let width: number | null = meta.width ?? null;
  let height: number | null = meta.height ?? null;
  // Orientations 5–8 involve 90°/270° rotation — swap reported dimensions
  if (meta.orientation && meta.orientation >= 5 && meta.orientation <= 8) {
    [width, height] = [height, width];
  }
  const exifBuffer = (meta.exif as Buffer | undefined) ?? null;

  const thumbnail = await sharp(original)
    .rotate()                                        // apply EXIF orientation, then strip the tag
    .resize({ width: 800, withoutEnlargement: true })
    .jpeg({ quality: 80, progressive: true })
    .toBuffer();

  const thumbKey = thumbKeyFor(s3Key);

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: thumbKey,
      Body: thumbnail,
      ContentType: "image/jpeg",
    })
  );

  return { thumbKey, width, height, exifBuffer };
}
