"use server";

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { checkStorageLimit } from "./storage";

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export type PresignedUrlResult =
  | { url: string; key: string }
  | { error: "STORAGE_LIMIT_REACHED"; used: bigint; limit: bigint }
  | { error: string };

/**
 * Returns a presigned PUT URL for direct browser-to-S3 upload.
 * The caller is responsible for saving the returned key to the Photo table
 * after the upload succeeds.
 */
export async function getPresignedUploadUrl(
  eventId: string,
  filename: string,
  contentType: string,
  fileSizeBytes: number
): Promise<PresignedUrlResult> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const bucket = process.env.AWS_S3_BUCKET_NAME;
  if (!bucket) return { error: "S3 bucket is not configured." };

  const { allowed, used, limit } = await checkStorageLimit(session.user.id, fileSizeBytes);
  if (!allowed) return { error: "STORAGE_LIMIT_REACHED", used, limit };

  // Sanitise filename: strip path separators, collapse spaces
  const safeName = filename
    .replace(/[/\\]/g, "")
    .replace(/\s+/g, "_")
    .toLowerCase();

  const key = `photographers/${session.user.id}/events/${eventId}/${Date.now()}-${safeName}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 600 }); // 10 min

  return { url, key };
}

/**
 * Returns a presigned PUT URL for a cover photo.
 * Key lives under a dedicated `cover/` prefix so it's easy to identify.
 */
export async function getPresignedCoverUploadUrl(
  eventId: string,
  filename: string,
  contentType: string,
  fileSizeBytes: number
): Promise<PresignedUrlResult> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const bucket = process.env.AWS_S3_BUCKET_NAME;
  if (!bucket) return { error: "S3 bucket is not configured." };

  const { allowed, used, limit } = await checkStorageLimit(session.user.id, fileSizeBytes);
  if (!allowed) return { error: "STORAGE_LIMIT_REACHED", used, limit };

  const safeName = filename
    .replace(/[/\\]/g, "")
    .replace(/\s+/g, "_")
    .toLowerCase();

  const key = `photographers/${session.user.id}/events/${eventId}/cover/${Date.now()}-${safeName}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 min
  return { url, key };
}

/**
 * Returns a presigned GET URL that forces a browser download.
 * Valid for 5 minutes — short enough to limit sharing of the URL itself.
 */
export async function getPresignedDownloadUrl(
  key: string,
  filename: string
): Promise<string> {
  const bucket = process.env.AWS_S3_BUCKET_NAME!;
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    // Forces "Save As" dialog instead of in-browser display
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
  });
  return getSignedUrl(s3, command, { expiresIn: 300 }); // 5 min
}

/**
 * Returns a presigned PUT URL for a studio logo.
 * Key lives under branding/{userId}/logo/
 */
export async function getPresignedLogoUploadUrl(
  filename: string,
  contentType: string
): Promise<PresignedUrlResult> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const bucket = process.env.AWS_S3_BUCKET_NAME;
  if (!bucket) return { error: "S3 bucket is not configured." };

  const safeName = filename
    .replace(/[/\\]/g, "")
    .replace(/\s+/g, "_")
    .toLowerCase();

  const key = `branding/${session.user.id}/logo/${Date.now()}-${safeName}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 300 });
  return { url, key };
}

export async function deleteS3Object(key: string): Promise<{ error?: string }> {
  const bucket = process.env.AWS_S3_BUCKET_NAME;
  if (!bucket) return { error: "S3 bucket is not configured." };

  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return {};
  } catch (err) {
    return { error: (err as Error).message };
  }
}
