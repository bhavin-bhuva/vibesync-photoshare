"use server";

import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { deleteS3Object, deleteS3Objects } from "@/lib/s3";
import { checkStorageLimit } from "@/lib/storage";
import { getCloudfrontPreviewUrl, getCloudfrontSignedUrl } from "@/lib/cloudfront";
import { createThumbnail } from "@/lib/thumbnail";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import {
  processEventPhotosFaces,
  processSinglePhotoFaces,
} from "@/lib/faceIndexing";
import type { Photo } from "@/generated/prisma/client";

export async function getPhotoLightboxUrl(
  photoId: string
): Promise<{ url: string | null } | { error: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const photo = await db.photo.findFirst({
    where: { id: photoId, event: { userId: session.user.id } },
    select: { s3Key: true },
  });
  if (!photo) return { error: "Photo not found." };

  const url = await getCloudfrontPreviewUrl(photo.s3Key, 1920);
  return { url };
}

export async function getStorageStatus(): Promise<
  { percentUsed: number; availableBytes: number } | { error: string }
> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized" };
  const { percentUsed, used, limit } = await checkStorageLimit(session.user.id, 0);
  return { percentUsed, availableBytes: Number(limit - used) };
}

export async function savePhotoRecord(
  eventId: string,
  s3Key: string,
  filename: string,
  size: number
): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  // Verify event belongs to this user before writing
  const event = await db.event.findFirst({
    where: { id: eventId, userId: session.user.id },
    select: { id: true },
  });
  if (!event) return { error: "Event not found." };

  // Generate thumbnail before the DB write so we can store the key atomically.
  // Best-effort: a failure here doesn't block the photo from being saved.
  let thumbS3Key: string | null = null;
  try {
    thumbS3Key = await createThumbnail(s3Key);
  } catch (err) {
    console.error("[savePhotoRecord] Thumbnail generation failed:", (err as Error).message);
  }

  await db.$transaction([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.photo.create as any)({
      data: { eventId, s3Key, thumbS3Key, filename, size },
    }),
    db.user.update({
      where: { id: session.user.id },
      data: { storageUsedBytes: { increment: BigInt(size) } },
    }),
  ]);

  revalidatePath(`/dashboard/events/${eventId}`);
  revalidatePath("/dashboard");
  return {};
}

export async function deletePhotoAction(
  photoId: string
): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  // Fetch photo + verify ownership via the event relationship
  const photo = await db.photo.findFirst({
    where: { id: photoId, event: { userId: session.user.id } },
    include: { event: { select: { id: true } } },
  });
  if (!photo) return { error: "Photo not found." };

  // Delete from S3 first — if this fails we don't remove the DB record
  const s3Result = await deleteS3Object(photo.s3Key);
  if (s3Result.error) return { error: s3Result.error };

  // Best-effort thumbnail cleanup — orphaned thumb is acceptable if this fails
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const thumbKey = (photo as any).thumbS3Key as string | null;
  if (thumbKey) await deleteS3Object(thumbKey).catch(() => undefined);

  await db.$transaction([
    db.photo.delete({ where: { id: photoId } }),
    db.user.update({
      where: { id: session.user.id },
      data: { storageUsedBytes: { decrement: BigInt(photo.size) } },
    }),
  ]);

  revalidatePath(`/dashboard/events/${photo.event.id}`);
  revalidatePath("/dashboard");
  return {};
}

export async function bulkDeletePhotosAction(
  photoIds: string[]
): Promise<{ deleted: number; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { deleted: 0, error: "Unauthorized." };
  if (photoIds.length === 0) return { deleted: 0 };

  type PhotoRow = { id: string; s3Key: string; thumbS3Key?: string | null; size: number; event: { id: string } };
  // Verify ownership of all photos in a single query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const photos = (await db.photo.findMany({
    where: { id: { in: photoIds }, event: { userId: session.user.id } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    include: { event: { select: { id: true } } } as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })) as unknown as PhotoRow[];

  if (photos.length === 0) return { deleted: 0 };

  // Delete S3 objects — best-effort; orphaned objects are acceptable over blocking the delete
  const keys: string[] = photos.flatMap((p) => [
    p.s3Key,
    ...(p.thumbS3Key ? [p.thumbS3Key] : []),
  ]);
  if (keys.length > 0) await deleteS3Objects(keys).catch(() => undefined);

  const totalSize = photos.reduce((sum, p) => sum + p.size, 0);
  const ids = photos.map((p) => p.id);

  await db.$transaction([
    db.photo.deleteMany({ where: { id: { in: ids } } }),
    db.user.update({
      where: { id: session.user.id },
      data: { storageUsedBytes: { decrement: BigInt(totalSize) } },
    }),
  ]);

  const eventIds = [...new Set(photos.map((p) => p.event.id))];
  for (const eId of eventIds) revalidatePath(`/dashboard/events/${eId}`);
  revalidatePath("/dashboard");

  return { deleted: photos.length };
}

// ─── Cover photo ──────────────────────────────────────────────────────────────

export async function setCoverPhotoAction(
  eventId: string,
  s3Key: string
): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const event = await db.event.findFirst({
    where: { id: eventId, userId: session.user.id },
    select: { id: true },
  });
  if (!event) return { error: "Event not found." };

  await db.event.update({
    where: { id: eventId },
    data: { coverPhotoKey: s3Key },
  });

  revalidatePath(`/dashboard/events/${eventId}`);
  revalidatePath("/dashboard");
  return {};
}

// ─── Shared links ─────────────────────────────────────────────────────────────

export async function createSharedLinkAction(
  eventId: string,
  accessType: "PASSWORD" | "PIN" | "NONE",
  credential: string | null,
  expiresAt: string | null,
  faceSearchEnabled = false,
  groupVisibilityOverrides: Record<string, boolean> | null = null
): Promise<{ slug?: string; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  if (accessType === "PASSWORD") {
    if (!credential || credential.length < 4)
      return { error: "Password must be at least 4 characters." };
  } else if (accessType === "PIN") {
    if (!credential || !/^\d{4}$/.test(credential))
      return { error: "PIN must be exactly 4 digits (0–9)." };
  }

  const event = await db.event.findFirst({
    where: { id: eventId, userId: session.user.id },
    select: { id: true },
  });
  if (!event) return { error: "Event not found." };

  const slug = randomBytes(8).toString("hex"); // 16-char hex, URL-safe

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {
    slug,
    accessType,
    eventId,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    faceSearchEnabled,
    ...(groupVisibilityOverrides && Object.keys(groupVisibilityOverrides).length > 0
      ? { groupVisibilityOverrides }
      : {}),
  };

  if (accessType === "PASSWORD" && credential) {
    data.passwordHash = await bcrypt.hash(credential, 10);
  } else if (accessType === "PIN" && credential) {
    data.pin = await bcrypt.hash(credential, 10);
    data.pinPlain = credential;
  }

  await db.sharedLink.create({ data });

  revalidatePath(`/dashboard/events/${eventId}`);
  return { slug };
}

export async function getSharedLinkPin(
  linkId: string
): Promise<{ pin?: string; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const link = await db.sharedLink.findFirst({
    where: { id: linkId, event: { userId: session.user.id } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: { pinPlain: true } as any,
  }) as { pinPlain: string | null } | null;

  if (!link) return { error: "Link not found." };
  if (!link.pinPlain) return { error: "PIN not available." };
  return { pin: link.pinPlain };
}

export async function revokeSharedLinkAction(
  linkId: string
): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const link = await db.sharedLink.findFirst({
    where: { id: linkId, event: { userId: session.user.id } },
    include: { event: { select: { id: true } } },
  });
  if (!link) return { error: "Link not found." };

  await db.sharedLink.delete({ where: { id: linkId } });
  revalidatePath(`/dashboard/events/${link.event.id}`);
  return {};
}

// ─── People tab ───────────────────────────────────────────────────────────────

/** Enable face indexing for an event and kick off a full rescan of existing photos. */
export async function enableFaceIndexingAction(
  eventId: string
): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const event = await db.event.findFirst({
    where: { id: eventId, userId: session.user.id },
    select: { id: true },
  });
  if (!event) return { error: "Event not found." };

  await db.event.update({
    where: { id: eventId },
    data: { faceIndexingEnabled: true },
  });

  const photoCount = await db.photo.count({ where: { eventId, status: "READY" } });

  if (photoCount > 0) {
    const job = await db.faceIndexingJob.create({
      data: { eventId, status: "PENDING", totalPhotos: photoCount },
      select: { id: true },
    });
    processEventPhotosFaces(eventId, job.id).catch((err: Error) =>
      console.error("[enableFaceIndexing] Background job failed:", err.message)
    );
  }

  revalidatePath(`/dashboard/events/${eventId}`);
  return {};
}

/** Kick off a full face rescan for an event. */
export async function startRescanAction(
  eventId: string
): Promise<{ jobId?: string; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const event = await db.event.findFirst({
    where: { id: eventId, userId: session.user.id },
    select: { id: true, faceIndexingEnabled: true },
  });
  if (!event) return { error: "Event not found." };
  if (!event.faceIndexingEnabled) return { error: "Face indexing is not enabled." };

  // Prevent duplicate jobs
  const running = await db.faceIndexingJob.findFirst({
    where: { eventId, status: { in: ["PENDING", "RUNNING", "CLUSTERING"] } },
    select: { id: true },
  });
  if (running) return { error: "A scan is already in progress." };

  const photoCount = await db.photo.count({ where: { eventId, status: "READY" } });
  const job = await db.faceIndexingJob.create({
    data: { eventId, status: "PENDING", totalPhotos: photoCount },
    select: { id: true },
  });

  processEventPhotosFaces(eventId, job.id).catch((err: Error) =>
    console.error("[startRescan] Background job failed:", err.message)
  );

  return { jobId: job.id };
}

/** Poll the active indexing job for this event — lightweight, called every 3 s. */
export async function pollJobProgressAction(eventId: string): Promise<{
  job: {
    status: string;
    processedPhotos: number;
    totalPhotos: number;
    facesFound: number;
  } | null;
}> {
  const session = await getServerSession(authOptions);
  if (!session) return { job: null };

  // Verify ownership without throwing — polling must never break the UI
  const event = await db.event.findFirst({
    where: { id: eventId, userId: session.user.id },
    select: { id: true },
  });
  if (!event) return { job: null };

  const job = await db.faceIndexingJob.findFirst({
    where: { eventId, status: { in: ["PENDING", "RUNNING", "CLUSTERING"] } },
    orderBy: { createdAt: "desc" },
    select: { status: true, processedPhotos: true, totalPhotos: true, facesFound: true },
  });

  return { job: job ?? null };
}

/** Set or clear the label on a FaceCluster. */
export async function setClusterLabelAction(
  clusterId: string,
  label: string
): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const cluster = await db.faceCluster.findFirst({
    where: { id: clusterId, event: { userId: session.user.id } },
    select: { id: true },
  });
  if (!cluster) return { error: "Cluster not found." };

  await db.faceCluster.update({
    where: { id: clusterId },
    data: { label: label.trim() || null },
  });
  return {};
}

/** Toggle the isHidden flag on a FaceCluster. */
export async function toggleClusterHiddenAction(
  clusterId: string
): Promise<{ isHidden?: boolean; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const cluster = await db.faceCluster.findFirst({
    where: { id: clusterId, event: { userId: session.user.id } },
    select: { id: true, isHidden: true },
  });
  if (!cluster) return { error: "Cluster not found." };

  const updated = await db.faceCluster.update({
    where: { id: clusterId },
    data: { isHidden: !cluster.isHidden },
    select: { isHidden: true },
  });
  return { isHidden: updated.isHidden };
}

/** Return thumbnail-signed photos for a cluster (used by cluster photo modal). */
export async function getClusterPhotosAction(clusterId: string): Promise<{
  photos: (Photo & { thumbnailUrl: string | null })[];
  error?: string;
}> {
  const session = await getServerSession(authOptions);
  if (!session) return { photos: [], error: "Unauthorized." };

  const cluster = await db.faceCluster.findFirst({
    where: { id: clusterId, event: { userId: session.user.id } },
    select: { id: true },
  });
  if (!cluster) return { photos: [], error: "Cluster not found." };

  // Get unique photos that have at least one face in this cluster, with all fields
  const faceRecords = await db.faceRecord.findMany({
    where: { faceClusterId: clusterId },
    select: {
      photo: {
        select: {
          id: true, s3Key: true, thumbS3Key: true, filename: true,
          size: true, status: true, width: true, height: true,
          createdAt: true, eventId: true,
        },
      },
    },
    distinct: ["photoId"],
    orderBy: { photo: { createdAt: "desc" } },
  });

  const photos = await Promise.all(
    faceRecords.map(async ({ photo }) => ({
      ...(photo as unknown as Photo),
      thumbnailUrl: photo.thumbS3Key
        ? await getCloudfrontSignedUrl(photo.thumbS3Key)
        : await getCloudfrontPreviewUrl(photo.s3Key, 800),
    }))
  );

  return { photos };
}

/** Index a single newly-uploaded photo (called from upload flow context). */
export async function indexSinglePhotoAction(
  photoId: string,
  eventId: string
): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const photo = await db.photo.findFirst({
    where: { id: photoId, event: { userId: session.user.id } },
    select: { id: true, s3Key: true, eventId: true },
  });
  if (!photo) return { error: "Photo not found." };

  const job = await db.faceIndexingJob.create({
    data: { eventId, status: "PENDING", totalPhotos: 1 },
    select: { id: true },
  });

  processSinglePhotoFaces(photo, job.id).catch((err: Error) =>
    console.error("[indexSinglePhoto] Failed:", err.message)
  );

  return {};
}

// ─── Delete all face data for an event ───────────────────────────────────────

/**
 * Permanently removes all face data for an event:
 *   • All FaceRecord rows (embeddings + crop S3 keys)
 *   • All FaceCluster rows (cover crops)
 *   • All FaceIndexingJob rows
 *   • S3 face-crop objects for the event (best-effort)
 *   • Resets faceIndexingEnabled → false and records faceDataDeletedAt
 *   • Disables faceSearchEnabled on all SharedLinks for this event
 */
export async function deleteEventFaceDataAction(
  eventId: string
): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const event = await db.event.findFirst({
    where: { id: eventId, userId: session.user.id },
    select: { id: true },
  });
  if (!event) return { error: "Event not found." };

  // Collect S3 keys before deletion
  const [faceRecords, faceClusters] = await Promise.all([
    db.faceRecord.findMany({
      where: { eventId },
      select: { cropS3Key: true },
    }),
    db.faceCluster.findMany({
      where: { eventId },
      select: { coverCropS3Key: true },
    }),
  ]);

  const s3Keys = [
    ...faceRecords.map((r) => r.cropS3Key),
    ...faceClusters.map((c) => c.coverCropS3Key),
  ];

  // Delete S3 objects best-effort (don't block DB cleanup on S3 errors)
  if (s3Keys.length > 0) {
    const { errors } = await deleteS3Objects(s3Keys);
    if (errors > 0) {
      console.error(`[deleteEventFaceData] ${errors} S3 delete errors for event ${eventId}`);
    }
  }

  // Delete all DB records and reset event flags in a transaction
  await db.$transaction([
    db.faceRecord.deleteMany({ where: { eventId } }),
    db.faceCluster.deleteMany({ where: { eventId } }),
    db.faceIndexingJob.deleteMany({ where: { eventId } }),
    db.faceSearchSession.deleteMany({ where: { eventId } }),
    // Disable face search on all shared links for this event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.sharedLink.updateMany as any)({
      where: { eventId },
      data: { faceSearchEnabled: false },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.event.update as any)({
      where: { id: eventId },
      data: {
        faceIndexingEnabled: false,
        faceDataDeletedAt: new Date(),
        lastClusteredAt: null,
      },
    }),
  ]);

  revalidatePath(`/dashboard/events/${eventId}`);
  return {};
}
