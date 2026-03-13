"use server";

import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { signShareToken, verifyShareToken } from "@/lib/share-token";
import { getPresignedDownloadUrl } from "@/lib/s3";
import { sendNewSelectionEmail } from "@/lib/ses";

// ─── PIN rate limiter ─────────────────────────────────────────────────────────
// In-memory, process-scoped. Single-instance deployment is fine; a cache miss
// on multi-instance just means each instance has its own counter (still locks
// after 5 attempts per instance, which is acceptable).

const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

const pinAttempts = new Map<string, { count: number; lockedUntil: number }>();

function getPinLock(slug: string): { locked: false } | { locked: true; minutesRemaining: number } {
  const entry = pinAttempts.get(slug);
  if (!entry || entry.count < MAX_PIN_ATTEMPTS) return { locked: false };
  const remaining = entry.lockedUntil - Date.now();
  if (remaining <= 0) {
    pinAttempts.delete(slug);
    return { locked: false };
  }
  return { locked: true, minutesRemaining: Math.ceil(remaining / 60_000) };
}

function recordPinFailure(slug: string): void {
  const entry = pinAttempts.get(slug) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_PIN_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
  }
  pinAttempts.set(slug, entry);
}

function clearPinAttempts(slug: string): void {
  pinAttempts.delete(slug);
}

export async function submitPhotoSelectionAction(
  slug: string,
  sharedLinkId: string,
  photos: { photoId: string; note: string }[],
  customerName: string,
  customerEmail: string,
  customerNote: string
): Promise<{ success: true; selectionId: string } | { error: string }> {
  // 1. Verify access cookie
  const cookieStore = await cookies();
  const token = cookieStore.get(`share_${slug}`)?.value;
  if (!token || !verifyShareToken(slug, token)) return { error: "Access denied." };

  if (!customerName.trim()) return { error: "Name is required." };
  if (photos.length === 0) return { error: "Select at least one photo." };

  // 2. Verify the link exists, is not expired, and fetch event + photographer info
  const link = await db.sharedLink.findUnique({
    where: { id: sharedLinkId, slug },
    select: {
      expiresAt: true,
      eventId: true,
      event: {
        select: {
          name: true,
          user: {
            select: {
              email: true,
              name: true,
              studioProfile: { select: { studioName: true } },
            },
          },
        },
      },
    },
  });
  if (!link) return { error: "Link not found." };
  if (link.expiresAt && new Date() > link.expiresAt) return { error: "This link has expired." };

  // 3. Verify every photoId belongs to this event
  const photoIds = photos.map((p) => p.photoId);
  const validPhotos = await db.photo.findMany({
    where: { id: { in: photoIds }, eventId: link.eventId },
    select: { id: true },
  });
  if (validPhotos.length !== photoIds.length) return { error: "One or more photos are invalid." };

  // 4. Create PhotoSelection + SelectedPhoto rows and flag the event — all in one transaction
  const [selection] = await db.$transaction([
    db.photoSelection.create({
      data: {
        sharedLinkId,
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim() || null,
        customerNote: customerNote.trim() || null,
        selectedPhotos: {
          create: photos.map(({ photoId, note }) => ({
            photoId,
            note: note.trim() || null,
          })),
        },
      },
      select: { id: true },
    }),
    db.event.update({
      where: { id: link.eventId },
      data: { hasNewSelections: true },
    }),
  ]);

  // 5. Send notification email to the photographer (non-blocking — failure won't undo the submission)
  const { event } = link;
  const photographer = event.user;
  const senderName = event.user.studioProfile?.studioName ?? photographer.name;
  const appUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");

  await sendNewSelectionEmail(photographer.email, senderName, {
    customerName: customerName.trim(),
    customerEmail: customerEmail.trim() || null,
    customerNote: customerNote.trim() || null,
    photoCount: photos.length,
    eventTitle: event.name,
    eventUrl: `${appUrl}/dashboard/events/${link.eventId}/selections`,
    studioName: event.user.studioProfile?.studioName ?? null,
  });

  return { success: true, selectionId: selection.id };
}

export async function verifySharedLinkAction(
  slug: string,
  credential: string | null
): Promise<{ error?: string; lockedMinutes?: number }> {
  const link = await db.sharedLink.findUnique({
    where: { slug },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: { accessType: true, passwordHash: true, pin: true, expiresAt: true } as any,
  }) as { accessType: string; passwordHash: string | null; pin: string | null; expiresAt: Date | null } | null;

  if (!link) return { error: "Link not found." };

  if (link.expiresAt && new Date() > link.expiresAt)
    return { error: "This link has expired." };

  if (link.accessType === "PASSWORD") {
    if (!credential || !link.passwordHash) return { error: "Incorrect password." };
    const valid = await bcrypt.compare(credential, link.passwordHash);
    if (!valid) return { error: "Incorrect password." };

  } else if (link.accessType === "PIN") {
    // Check lockout before attempting bcrypt (avoids timing oracle under lockout)
    const lock = getPinLock(slug);
    if (lock.locked) return { error: "locked", lockedMinutes: lock.minutesRemaining };

    if (!credential || !link.pin) return { error: "Incorrect PIN." };
    const valid = await bcrypt.compare(credential, link.pin);
    if (!valid) {
      recordPinFailure(slug);
      // Re-check: the failure just recorded might have triggered a lock
      const newLock = getPinLock(slug);
      if (newLock.locked) return { error: "locked", lockedMinutes: newLock.minutesRemaining };
      return { error: "Incorrect PIN." };
    }
    clearPinAttempts(slug);
  }
  // NONE: no credential check needed

  const token = signShareToken(slug);
  const cookieStore = await cookies();
  cookieStore.set(`share_${slug}`, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60, // 24 hours
    path: "/",
  });

  return {};
}

/**
 * Generates a short-lived S3 presigned GET URL for a photo download.
 * Requires a valid share-access cookie for the given slug, and verifies
 * that the requested photo actually belongs to the linked event.
 */
export async function getPhotoDownloadUrl(
  slug: string,
  photoId: string
): Promise<{ url?: string; error?: string }> {
  // 1. Verify the visitor has passed the password gate
  const cookieStore = await cookies();
  const token = cookieStore.get(`share_${slug}`)?.value;
  if (!token || !verifyShareToken(slug, token)) {
    return { error: "Access denied." };
  }

  // 2. Confirm the photo belongs to an event reachable via this slug
  const photo = await db.photo.findFirst({
    where: {
      id: photoId,
      event: { sharedLinks: { some: { slug } } },
    },
    select: { s3Key: true, filename: true },
  });
  if (!photo) return { error: "Photo not found." };

  // 3. Generate the presigned download URL
  const url = await getPresignedDownloadUrl(photo.s3Key, photo.filename);
  return { url };
}

// ─── verifyGalleryAccess ──────────────────────────────────────────────────────

type GalleryLink = {
  accessType: string;
  passwordHash: string | null;
  pin: string | null;
  expiresAt: Date | null;
};

type GalleryAccessAttemptRow = { id: string; attemptedAt: Date };

const WINDOW_MS = 15 * 60 * 1000; // 15-minute sliding window
const MAX_ATTEMPTS = 5;

/** Sets the share-access cookie that allows the client to view the gallery. */
async function grantGalleryAccess(slug: string): Promise<void> {
  const token = signShareToken(slug);
  const cookieStore = await cookies();
  cookieStore.set(`share_${slug}`, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60,
    path: "/",
  });
}

/**
 * Verifies a visitor's credential for a shared gallery link.
 *
 * Returns a discriminated union so callers can pattern-match on `error`:
 *   success           → cookie set, proceed to gallery
 *   LINK_EXPIRED      → link has passed its expiresAt date
 *   TOO_MANY_ATTEMPTS → rate-limit hit; unlocksAt is a Unix-ms timestamp
 *   WRONG_PIN         → bad PIN; attemptsLeft tells how many tries remain
 *   WRONG_PASSWORD    → bad password; attemptsLeft tells how many tries remain
 *   INVALID           → link not found or type mismatch (treat as not found)
 *
 * Rate-limiting is per slug + IP: 5 attempts within a 15-minute sliding
 * window. Correct credentials clear that IP's counter for the slug.
 * As a housekeeping step, attempts older than 24 hours are deleted globally
 * before each check — no separate cron job required.
 */
export async function verifyGalleryAccess(
  slug: string,
  value: string | null,
  type: "NONE" | "PIN" | "PASSWORD"
): Promise<
  | { success: true }
  | { error: "LINK_EXPIRED" }
  | { error: "TOO_MANY_ATTEMPTS"; unlocksAt: number }
  | { error: "WRONG_PIN"; attemptsLeft: number }
  | { error: "WRONG_PASSWORD"; attemptsLeft: number }
  | { error: "INVALID" }
> {
  // 1. Fetch link
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const link = await (db as any).sharedLink.findUnique({
    where: { slug },
    select: { accessType: true, passwordHash: true, pin: true, expiresAt: true },
  }) as GalleryLink | null;

  if (!link) return { error: "INVALID" };

  // 2. Expiry check
  if (link.expiresAt && new Date() > link.expiresAt) {
    return { error: "LINK_EXPIRED" };
  }

  // 3. NONE — grant immediately, no credential required
  if (link.accessType === "NONE") {
    await grantGalleryAccess(slug);
    return { success: true };
  }

  // Guard: reject if the caller's declared type doesn't match the stored type
  if (link.accessType !== type) return { error: "INVALID" };

  // 4 & 5. PIN or PASSWORD — housekeeping, rate-limit, then bcrypt
  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0].trim() ??
    headerStore.get("x-real-ip") ??
    "unknown";

  const now = Date.now();
  const windowStart  = new Date(now - WINDOW_MS);
  const cleanupBefore = new Date(now - 24 * 60 * 60 * 1000); // 24 h

  // Housekeeping: delete globally stale records (>24 h) so the table stays small.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).galleryAccessAttempt.deleteMany({
    where: { attemptedAt: { lt: cleanupBefore } },
  });

  // Count recent attempts from this IP for this slug
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recentAttempts = await (db as any).galleryAccessAttempt.findMany({
    where: { slug, ipAddress: ip, attemptedAt: { gte: windowStart } },
    orderBy: { attemptedAt: "asc" },
    select: { id: true, attemptedAt: true },
  }) as GalleryAccessAttemptRow[];

  if (recentAttempts.length >= MAX_ATTEMPTS) {
    // Already locked — unlocksAt is when the oldest attempt leaves the window
    const unlocksAt = recentAttempts[0].attemptedAt.getTime() + WINDOW_MS;
    return { error: "TOO_MANY_ATTEMPTS", unlocksAt };
  }

  // Verify credential
  const hash = type === "PIN" ? link.pin : link.passwordHash;
  if (!value || !hash) {
    // Misconfigured link — count as a wrong attempt
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).galleryAccessAttempt.create({ data: { slug, ipAddress: ip } });
    const attemptsLeft = MAX_ATTEMPTS - (recentAttempts.length + 1);
    return type === "PIN"
      ? { error: "WRONG_PIN", attemptsLeft }
      : { error: "WRONG_PASSWORD", attemptsLeft };
  }

  const valid = await bcrypt.compare(value, hash);

  if (!valid) {
    // Log the failed attempt
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).galleryAccessAttempt.create({ data: { slug, ipAddress: ip } });

    // Re-query (slug + IP) for accurate post-insert count and oldest timestamp
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatedAttempts = await (db as any).galleryAccessAttempt.findMany({
      where: { slug, ipAddress: ip, attemptedAt: { gte: windowStart } },
      orderBy: { attemptedAt: "asc" },
      select: { id: true, attemptedAt: true },
    }) as GalleryAccessAttemptRow[];

    if (updatedAttempts.length >= MAX_ATTEMPTS) {
      const unlocksAt = updatedAttempts[0].attemptedAt.getTime() + WINDOW_MS;
      return { error: "TOO_MANY_ATTEMPTS", unlocksAt };
    }

    const attemptsLeft = MAX_ATTEMPTS - updatedAttempts.length;
    return type === "PIN"
      ? { error: "WRONG_PIN", attemptsLeft }
      : { error: "WRONG_PASSWORD", attemptsLeft };
  }

  // Correct — clear this IP's attempts for this slug and grant access
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).galleryAccessAttempt.deleteMany({ where: { slug, ipAddress: ip } });
  await grantGalleryAccess(slug);
  return { success: true };
}
