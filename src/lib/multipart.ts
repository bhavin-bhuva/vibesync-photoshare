"use server";

import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkStorageLimit, incrementStorage } from "@/lib/storage";
import { createThumbnail } from "@/lib/thumbnail";
import { processSinglePhotoFaces } from "@/lib/faceIndexing";

// ─── S3 client ────────────────────────────────────────────────────────────────

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET_NAME!;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompletedPart {
  PartNumber: number;
  ETag: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[/\\]/g, "")
    .replace(/\s+/g, "_")
    .toLowerCase();
}

// ─── 1. createMultipartUpload ─────────────────────────────────────────────────

export async function createMultipartUpload(
  eventId: string,
  filename: string,
  mimeType: string,
  fileSize: number
): Promise<
  | { uploadId: string; s3Key: string; photoId: string }
  | { error: string }
> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const userId = session.user.id;

  // Verify the event belongs to this user
  const event = await db.event.findFirst({
    where: { id: eventId, userId },
    select: { id: true },
  });
  if (!event) return { error: "Event not found." };

  // Check storage capacity before allocating anything in S3
  const { allowed } = await checkStorageLimit(userId, fileSize);
  if (!allowed) return { error: "Storage limit reached. Upgrade your plan to upload more." };

  const safeName = sanitizeFilename(filename);
  const s3Key = `photographers/${userId}/events/${eventId}/${crypto.randomUUID()}-${safeName}`;

  // Initiate the S3 multipart upload
  const { UploadId: uploadId } = await s3.send(
    new CreateMultipartUploadCommand({
      Bucket: BUCKET,
      Key: s3Key,
      ContentType: mimeType,
    })
  );

  if (!uploadId) return { error: "S3 did not return an UploadId." };

  // Create the Photo row immediately so we can track the in-progress upload.
  // status defaults to UPLOADING; size is stored upfront for storage quota displays.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const photo = await (db.photo.create as any)({
    data: {
      eventId,
      s3Key,
      filename,
      size: fileSize,
      status: "UPLOADING",
    },
    select: { id: true },
  });

  return { uploadId, s3Key, photoId: photo.id };
}

// ─── 2. getChunkPresignedUrl ──────────────────────────────────────────────────

export async function getChunkPresignedUrl(
  s3Key: string,
  uploadId: string,
  partNumber: number
): Promise<{ presignedUrl: string } | { error: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  // Verify the key belongs to the authenticated user by checking the path prefix.
  // Key format: photographers/{userId}/events/{eventId}/...
  const expectedPrefix = `photographers/${session.user.id}/`;
  if (!s3Key.startsWith(expectedPrefix)) return { error: "Forbidden." };

  const presignedUrl = await getSignedUrl(
    s3,
    new UploadPartCommand({
      Bucket: BUCKET,
      Key: s3Key,
      UploadId: uploadId,
      PartNumber: partNumber,
    }),
    { expiresIn: 3600 } // 1 hour
  );

  return { presignedUrl };
}

// ─── 3. completeMultipartUpload ───────────────────────────────────────────────

export async function completeMultipartUpload(
  s3Key: string,
  uploadId: string,
  parts: CompletedPart[],
  photoId: string,
  fileSize: number,
  width: number | null,
  height: number | null
): Promise<{ success: true; photoId: string } | { error: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  // Verify the photo belongs to the authenticated user.
  // Also fetch eventId and faceIndexingEnabled so we can trigger indexing below.
  const photo = await db.photo.findFirst({
    where: { id: photoId, event: { userId: session.user.id } },
    select: {
      id: true,
      s3Key: true,
      eventId: true,
      event: { select: { faceIndexingEnabled: true } },
    },
  });
  if (!photo) return { error: "Photo not found." };

  // Tell S3 the upload is finished — it will assemble the parts into the final object
  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: s3Key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((p) => ({ PartNumber: p.PartNumber, ETag: p.ETag })),
      },
    })
  );

  // Mark the photo as ready and store final metadata
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.photo.update as any)({
    where: { id: photoId },
    data: {
      status: "READY",
      size: fileSize,
      width: width ?? undefined,
      height: height ?? undefined,
    },
  });

  // Increment the user's storage quota now that the file is permanently stored
  await incrementStorage(session.user.id, fileSize);

  // Thumbnail generation is intentionally fire-and-forget:
  // the photo is already usable; the thumb appears once S3 processing finishes.
  createThumbnail(s3Key)
    .then((thumbKey) =>
      db.photo.update({ where: { id: photoId }, data: { thumbS3Key: thumbKey } })
    )
    .catch((err: Error) =>
      console.error("[completeMultipartUpload] Thumbnail failed:", err.message)
    );

  // Face indexing — fire-and-forget so the upload response is never delayed.
  // Only runs when the photographer has enabled face indexing for this event.
  if (photo.event.faceIndexingEnabled) {
    db.faceIndexingJob.create({
      data: { eventId: photo.eventId, status: "PENDING", totalPhotos: 1 },
      select: { id: true },
    })
      .then((job) => {
        processSinglePhotoFaces(
          { id: photo.id, s3Key: photo.s3Key, eventId: photo.eventId },
          job.id
        ).catch((err: Error) =>
          console.error("[completeMultipartUpload] Face indexing failed:", err.message)
        );
      })
      .catch((err: Error) =>
        console.error("[completeMultipartUpload] FaceIndexingJob create failed:", err.message)
      );
  }

  return { success: true, photoId };
}

// ─── 4. abortMultipartUpload ──────────────────────────────────────────────────

export async function abortMultipartUpload(
  s3Key: string,
  uploadId: string,
  photoId: string
): Promise<{ success: true } | { error: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  // Verify ownership before touching anything
  const photo = await db.photo.findFirst({
    where: { id: photoId, event: { userId: session.user.id } },
    select: { id: true },
  });
  if (!photo) return { error: "Photo not found." };

  // Tell S3 to discard all uploaded parts — this releases S3 storage
  await s3.send(
    new AbortMultipartUploadCommand({
      Bucket: BUCKET,
      Key: s3Key,
      UploadId: uploadId,
    })
  );

  // Remove the in-progress Photo row — storage was never incremented so no decrement needed
  await db.photo.delete({ where: { id: photoId } });

  return { success: true };
}
