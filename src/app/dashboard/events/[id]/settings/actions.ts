"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteS3Objects } from "@/lib/s3";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

export interface UpdateEventDetailsData {
  name: string;
  date: string; // YYYY-MM-DD
  description: string | null;
  coverPhotoId: string | null; // null = don't change; string = update to this photo's s3Key
}

export async function updateEventDetails(
  eventId: string,
  data: UpdateEventDetailsData,
): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const name = data.name.trim();
  if (!name) return { error: "Event title is required." };
  if (name.length > 100) return { error: "Event title must be 100 characters or fewer." };
  if (!data.date) return { error: "Event date is required." };

  const event = await db.event.findFirst({
    where: { id: eventId, userId: session.user.id },
    select: { id: true },
  });
  if (!event) return { error: "Event not found." };

  let newCoverPhotoKey: string | undefined;
  if (data.coverPhotoId !== null) {
    const photo = await db.photo.findFirst({
      where: { id: data.coverPhotoId, eventId, event: { userId: session.user.id } },
      select: { s3Key: true },
    });
    if (!photo) return { error: "Selected cover photo not found." };
    newCoverPhotoKey = photo.s3Key;
  }

  await db.event.update({
    where: { id: eventId },
    data: {
      name,
      date: new Date(data.date),
      description: data.description?.trim() || null,
      ...(newCoverPhotoKey !== undefined && { coverPhotoKey: newCoverPhotoKey }),
    },
  });

  revalidatePath(`/dashboard/events/${eventId}`);
  revalidatePath(`/dashboard/events/${eventId}/settings`);
  revalidatePath("/dashboard");

  return {};
}

// ─── updateEventGallery ───────────────────────────────────────────────────────

import { THEME_ACCESS, ANIMATION_ACCESS, type PlanTier } from "@/lib/plans";

export interface CustomThemeInput {
  bg: string;
  surface: string;
  text: string;
  accent: string;
}

export interface UpdateEventGalleryData {
  theme: string;
  customThemeData: CustomThemeInput | null;
  welcomeEnabled: boolean;
  welcomeMessage: string | null;
  welcomeHeroPhotoId: string | null;
  introAnimation: string;
  showPhotoCount: boolean;
  showEventDate: boolean;
  galleryTitle: string | null;
  gallerySubtitle: string | null;
}

export async function updateEventGallery(
  eventId: string,
  data: UpdateEventGalleryData,
): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const sub = await db.subscription.findFirst({
    where: { userId: session.user.id },
    select: { planTier: true },
  });
  const plan = (sub?.planTier ?? "FREE") as PlanTier;

  if (!THEME_ACCESS[plan].includes(data.theme))
    return { error: `Theme "${data.theme}" is not available on the ${plan} plan.` };
  if (!ANIMATION_ACCESS[plan].includes(data.introAnimation))
    return { error: `Animation "${data.introAnimation}" is not available on the ${plan} plan.` };

  const event = await db.event.findFirst({
    where: { id: eventId, userId: session.user.id },
    select: { id: true },
  });
  if (!event) return { error: "Event not found." };

  if (data.welcomeHeroPhotoId) {
    const photo = await db.photo.findFirst({
      where: { id: data.welcomeHeroPhotoId, eventId },
      select: { id: true },
    });
    if (!photo) return { error: "Hero photo not found." };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.event.update as any)({
    where: { id: eventId },
    data: {
      theme: data.theme,
      customThemeData: data.theme === 'custom' ? (data.customThemeData ?? null) : null,
      welcomeEnabled: data.welcomeEnabled,
      welcomeMessage: data.welcomeMessage?.trim() || null,
      welcomeHeroPhotoId: data.welcomeHeroPhotoId,
      introAnimation: data.introAnimation,
      showPhotoCount: data.showPhotoCount,
      showEventDate: data.showEventDate,
      galleryTitle: data.galleryTitle?.trim() || null,
      gallerySubtitle: data.gallerySubtitle?.trim() || null,
    },
  });

  revalidatePath(`/dashboard/events/${eventId}/settings`);
  revalidatePath(`/dashboard/events/${eventId}`);
  return {};
}

// ─── updateSharedLink ─────────────────────────────────────────────────────────

export interface UpdateSharedLinkData {
  accessType: "NONE" | "PIN" | "PASSWORD";
  credential: string | null; // new cred; null = keep existing (only valid when accessType unchanged)
  expiresAt: string | null;
  faceSearchEnabled: boolean;
  downloadsEnabled: boolean;
  zipDownloadEnabled: boolean;
  selectionEnabled: boolean;
  showPinOnCard: boolean;
  customCardMessage: string | null;
  groupVisibilityOverrides: Record<string, boolean> | null;
  defaultGridDensity: string;
  theme: string;
  welcomeEnabled: boolean;
  welcomeMessage: string | null;
  welcomeHeroPhotoId: string | null;
  introAnimation: string;
  showPhotoCount: boolean;
  showEventDate: boolean;
  galleryTitle: string | null;
  gallerySubtitle: string | null;
}

export async function updateSharedLink(
  linkId: string,
  data: UpdateSharedLinkData,
): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const link = await db.sharedLink.findFirst({
    where: { id: linkId, event: { userId: session.user.id } },
    select: { id: true, accessType: true, event: { select: { id: true } } },
  });
  if (!link) return { error: "Link not found." };

  if (data.accessType === "PASSWORD" && data.credential !== null) {
    if (data.credential.length < 4)
      return { error: "Password must be at least 4 characters." };
  }
  if (data.accessType === "PIN" && data.credential !== null) {
    if (!/^\d{4}$/.test(data.credential))
      return { error: "PIN must be exactly 4 digits." };
  }
  if (data.accessType !== "NONE" && data.credential === null && link.accessType !== data.accessType) {
    return { error: "A credential is required when changing protection type." };
  }

  // Build auth fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authFields: any = { accessType: data.accessType };
  if (data.accessType === "NONE") {
    authFields.passwordHash = null;
    authFields.pin = null;
    authFields.pinPlain = null;
  } else if (data.credential !== null) {
    if (data.accessType === "PASSWORD") {
      authFields.passwordHash = await bcrypt.hash(data.credential, 10);
      authFields.pin = null;
      authFields.pinPlain = null;
    } else if (data.accessType === "PIN") {
      authFields.pin = await bcrypt.hash(data.credential, 10);
      authFields.pinPlain = data.credential;
      authFields.passwordHash = null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.sharedLink.update as any)({
    where: { id: linkId },
    data: {
      ...authFields,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      faceSearchEnabled: data.faceSearchEnabled,
      downloadsEnabled: data.downloadsEnabled,
      zipDownloadEnabled: data.zipDownloadEnabled,
      selectionEnabled: data.selectionEnabled,
      showPinOnCard: data.showPinOnCard,
      customCardMessage: data.customCardMessage?.trim() || null,
      groupVisibilityOverrides:
        data.groupVisibilityOverrides && Object.keys(data.groupVisibilityOverrides).length > 0
          ? data.groupVisibilityOverrides
          : null,
      defaultGridDensity: data.defaultGridDensity,
      theme: data.theme,
      welcomeEnabled: data.welcomeEnabled,
      welcomeMessage: data.welcomeMessage?.trim() || null,
      welcomeHeroPhotoId: data.welcomeHeroPhotoId,
      introAnimation: data.introAnimation,
      showPhotoCount: data.showPhotoCount,
      showEventDate: data.showEventDate,
      galleryTitle: data.galleryTitle?.trim() || null,
      gallerySubtitle: data.gallerySubtitle?.trim() || null,
      qrCardS3Key: null, // invalidate cached card
    },
  });

  revalidatePath(`/dashboard/events/${link.event.id}`);
  revalidatePath(`/dashboard/events/${link.event.id}/settings`);
  return {};
}

// ─── saveEventWatermark ───────────────────────────────────────────────────────

export interface EventWatermarkData {
  watermarkOverride: boolean;
  watermarkEnabled: boolean;
  watermarkSource: string;
  watermarkPosition: string;
  watermarkOpacity: number;
}

export async function saveEventWatermark(
  eventId: string,
  data: EventWatermarkData,
): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const event = await db.event.findFirst({
    where: { id: eventId, userId: session.user.id },
    select: { id: true },
  });
  if (!event) return { error: "Event not found." };

  const opacity = Math.min(80, Math.max(10, data.watermarkOpacity));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.event.update as any)({
    where: { id: eventId },
    data: {
      watermarkOverride: data.watermarkOverride,
      watermarkEnabled: data.watermarkEnabled,
      watermarkSource: data.watermarkSource,
      watermarkPosition: data.watermarkPosition,
      watermarkOpacity: opacity,
    },
  });

  revalidatePath(`/dashboard/events/${eventId}/settings`);
  return {};
}

// ─── archiveEvent ─────────────────────────────────────────────────────────────

export async function archiveEvent(
  eventId: string,
): Promise<{ error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const event = await db.event.findFirst({
    where: { id: eventId, userId: session.user.id },
    select: { id: true },
  });
  if (!event) return { error: "Event not found." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.event.update as any)({
    where: { id: eventId },
    data: { isArchived: true, archivedAt: new Date() },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/events/${eventId}/settings`);
  return {};
}

// ─── revokeAllLinksAction ─────────────────────────────────────────────────────

export async function revokeAllLinksAction(
  eventId: string,
): Promise<{ error?: string; revoked?: number }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const event = await db.event.findFirst({
    where: { id: eventId, userId: session.user.id },
    select: { id: true },
  });
  if (!event) return { error: "Event not found." };

  const result = await db.sharedLink.deleteMany({ where: { eventId } });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/events/${eventId}`);
  revalidatePath(`/dashboard/events/${eventId}/settings`);
  return { revoked: result.count };
}

// ─── deleteEventAction ────────────────────────────────────────────────────────

export async function deleteEventAction(
  eventId: string,
): Promise<{ error?: string; deleted?: true }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const event = await db.event.findFirst({
    where: { id: eventId, userId: session.user.id },
    select: { id: true },
  });
  if (!event) return { error: "Event not found." };

  // Collect all S3 keys before deletion
  const photos = await db.photo.findMany({
    where: { eventId },
    select: { s3Key: true, thumbS3Key: true, size: true },
  });

  const s3Keys = photos.flatMap((p) => [
    p.s3Key,
    ...(p.thumbS3Key ? [p.thumbS3Key] : []),
  ]);

  // Best-effort S3 cleanup
  if (s3Keys.length > 0) {
    await deleteS3Objects(s3Keys).catch(() => undefined);
  }

  // Collect cover photo key too
  const eventWithCover = await db.event.findUnique({
    where: { id: eventId },
    select: { coverPhotoKey: true },
  });
  if (eventWithCover?.coverPhotoKey) {
    await deleteS3Objects([eventWithCover.coverPhotoKey]).catch(() => undefined);
  }

  const totalSize = photos.reduce((s, p) => s + p.size, 0);

  // Delete event (cascades: photos, shared links, face data, culling jobs, etc.)
  await db.$transaction([
    db.event.delete({ where: { id: eventId } }),
    db.user.update({
      where: { id: session.user.id },
      data: { storageUsedBytes: { decrement: BigInt(totalSize) } },
    }),
  ]);

  revalidatePath("/dashboard");
  return { deleted: true };
}
