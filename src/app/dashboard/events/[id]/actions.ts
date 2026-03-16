"use server";

import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { deleteS3Object } from "@/lib/s3";
import { checkStorageLimit } from "@/lib/storage";
import { getCloudfrontPreviewUrl } from "@/lib/cloudfront";
import { createThumbnail } from "@/lib/thumbnail";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.$transaction([
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
  expiresAt: string | null
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
