"use server";

import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { signShareToken, verifyShareToken } from "@/lib/share-token";
import { getPresignedDownloadUrl } from "@/lib/s3";
import { sendNewSelectionEmail } from "@/lib/ses";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { searchFaceInEvent } from "@/lib/faceService";
import { randomUUID } from "crypto";
import { bufferToEmbedding } from "@/lib/embedding";

// ─── Face search S3 client ────────────────────────────────────────────────────

const faceS3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
const SELFIE_BUCKET = process.env.AWS_S3_BUCKET_NAME!;

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

// ─── Face search ─────────────────────────────────────────────────────────────

/**
 * Generate a short-lived presigned PUT URL so the browser can upload a selfie
 * directly to S3 without routing the binary through this server.
 *
 * Cookie-gated: requires the visitor to have already passed the password/PIN
 * gate so random internet traffic cannot write to the bucket.
 */
export async function getSelfieUploadUrl(
  slug: string,
  contentType: string
): Promise<{ url?: string; s3Key?: string; error?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(`share_${slug}`)?.value;
  if (!token || !verifyShareToken(slug, token)) return { error: "Access denied." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const link = await (db as any).sharedLink.findUnique({
    where: { slug },
    select: {
      faceSearchEnabled: true,
      event: { select: { id: true, faceIndexingEnabled: true } },
    },
  }) as { faceSearchEnabled: boolean; event: { id: string; faceIndexingEnabled: boolean } } | null;

  if (!link?.faceSearchEnabled || !link.event.faceIndexingEnabled) {
    return { error: "Face search is not enabled for this gallery." };
  }

  const ext = contentType === "image/png" ? "png" : "jpg";
  const s3Key = `selfies/${slug}/${Date.now()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: SELFIE_BUCKET,
    Key: s3Key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(faceS3, command, { expiresIn: 300 }); // 5 min
  return { url, s3Key };
}

/**
 * Run a face-search for the visitor using a selfie they already uploaded to S3.
 *
 * Returns the set of photo IDs in this event that contain a face matching the
 * selfie.  Creates + updates a FaceSearchSession row for auditing and cleanup
 * (the selfie S3 object is auto-expired via bucket lifecycle at 24 h).
 */
export async function runFaceSearch(
  slug: string,
  selfieS3Key: string
): Promise<{
  faceDetected?: boolean;
  matchedPhotoIds?: string[];
  totalCompared?: number;
  error?: string;
}> {
  const cookieStore = await cookies();
  const token = cookieStore.get(`share_${slug}`)?.value;
  if (!token || !verifyShareToken(slug, token)) return { error: "Access denied." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const link = await (db as any).sharedLink.findUnique({
    where: { slug },
    select: {
      faceSearchEnabled: true,
      event: { select: { id: true, faceIndexingEnabled: true } },
    },
  }) as { faceSearchEnabled: boolean; event: { id: string; faceIndexingEnabled: boolean } } | null;

  if (!link?.faceSearchEnabled || !link.event.faceIndexingEnabled) {
    return { error: "Face search is not enabled for this gallery." };
  }

  const eventId = link.event.id;

  // Create an audit record — status starts as SEARCHING
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await (db as any).faceSearchSession.create({
    data: {
      slug,
      eventId,
      selfieS3Key,
      status: "SEARCHING",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
    select: { id: true },
  }) as { id: string };

  try {
    const result = await searchFaceInEvent({
      selfieS3Key,
      selfieS3Bucket: SELFIE_BUCKET,
      eventId,
    });

    if (!result.query_face_detected) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).faceSearchSession.update({
        where: { id: session.id },
        data: { status: "DONE", matchedPhotoIds: [] },
      });
      return { faceDetected: false, matchedPhotoIds: [], totalCompared: result.total_compared };
    }

    const matchedFaceIds = result.matches
      .filter((m) => m.is_match)
      .map((m) => m.face_record_id);

    let matchedPhotoIds: string[] = [];
    if (matchedFaceIds.length > 0) {
      const faceRecords = await db.faceRecord.findMany({
        where: { id: { in: matchedFaceIds } },
        select: { photoId: true },
      });
      matchedPhotoIds = [...new Set(faceRecords.map((r) => r.photoId))];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).faceSearchSession.update({
      where: { id: session.id },
      data: { status: "DONE", matchedPhotoIds },
    });

    return { faceDetected: true, matchedPhotoIds, totalCompared: result.total_compared };
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).faceSearchSession.update({
      where: { id: session.id },
      data: { status: "FAILED" },
    });
    return { error: (err as Error).message };
  }
}

// ─── searchFaceInGallery ──────────────────────────────────────────────────────

const FACE_SERVICE_URL = process.env.FACE_SERVICE_URL!;
const FACE_SERVICE_API_KEY = process.env.FACE_SERVICE_API_KEY!;
const FACE_SIMILARITY_THRESHOLD = 0.6;

type LinkForFaceSearch = {
  id: string;
  faceSearchEnabled: boolean;
  expiresAt: Date | null;
  event: { id: string; faceIndexingEnabled: boolean };
};

/**
 * All-in-one face-search action called directly from the share-page modal.
 *
 * Accepts the selfie as a File (passed through Next.js's server-action
 * FormData boundary), uploads it server-side to S3 with an auto-delete tag,
 * then runs the face-search against every non-hidden FaceRecord in the event.
 *
 * Returns matched photo IDs immediately — the caller stores them in React
 * state to filter the gallery.
 */
export async function searchFaceInGallery(
  slug: string,
  selfieFile: File
): Promise<{
  matchedPhotoIds?: string[];
  matchedCount?: number;
  clustersFound?: number;
  error?: string;
}> {
  // ── 1. Cookie gate ─────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const token = cookieStore.get(`share_${slug}`)?.value;
  if (!token || !verifyShareToken(slug, token)) return { error: "Access denied." };

  // ── 2. Verify link: exists, not expired, faceSearchEnabled ─────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const link = await (db as any).sharedLink.findUnique({
    where: { slug },
    select: {
      id: true,
      faceSearchEnabled: true,
      expiresAt: true,
      event: { select: { id: true, faceIndexingEnabled: true } },
    },
  }) as LinkForFaceSearch | null;

  if (!link) return { error: "Link not found." };
  if (link.expiresAt && new Date() > link.expiresAt) return { error: "This link has expired." };
  if (!link.faceSearchEnabled) return { error: "Face search is not enabled for this gallery." };

  // ── 3. Verify event face indexing is on ────────────────────────────────────
  if (!link.event.faceIndexingEnabled) {
    return { error: "Face indexing is not enabled for this event." };
  }

  const eventId = link.event.id;

  // ── 4. Verify at least one cluster exists ──────────────────────────────────
  const clusterCount = await db.faceCluster.count({ where: { eventId } });
  if (clusterCount === 0) {
    return { error: "Face analysis has not completed for this gallery yet." };
  }

  // ── 5. Upload selfie to S3 ─────────────────────────────────────────────────
  // Key under selfies/ prefix — a bucket lifecycle rule auto-deletes this
  // prefix after 1 day, honouring the 24-hour privacy promise.
  const ext = selfieFile.type === "image/png" ? "png" : "jpg";
  const s3Key = `selfies/${slug}/${randomUUID()}.${ext}`;
  const fileBuffer = Buffer.from(await selfieFile.arrayBuffer());

  await faceS3.send(
    new PutObjectCommand({
      Bucket: SELFIE_BUCKET,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: selfieFile.type || "image/jpeg",
      // Tag consumed by the S3 lifecycle rule: expire selfies after 24 h
      Tagging: "auto-delete=true",
    })
  );

  // ── 6. Create FaceSearchSession audit record ───────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await (db as any).faceSearchSession.create({
    data: {
      slug,
      eventId,
      selfieS3Key: s3Key,
      status: "SEARCHING",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
    select: { id: true },
  }) as { id: string };

  // ── 7. Fetch only non-hidden face embeddings for this event ────────────────
  // Faces in hidden clusters are excluded so privacy-sensitive clusters (e.g.
  // a cluster the photographer hid) are never searched.
  const faceRecords = await db.faceRecord.findMany({
    where: {
      eventId,
      OR: [
        { faceClusterId: null },                      // unassigned faces
        { faceCluster: { isHidden: false } },         // faces in visible clusters
      ],
    },
    select: { id: true, embedding: true, photoId: true, faceClusterId: true },
  });

  if (faceRecords.length === 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).faceSearchSession.update({
      where: { id: session.id },
      data: { status: "DONE", matchedPhotoIds: [], matchedClusterIds: [] },
    });
    return { matchedPhotoIds: [], matchedCount: 0, clustersFound: 0 };
  }

  // ── 8. Call face service POST /search ──────────────────────────────────────
  const embeddings = faceRecords.map((r) => ({
    face_record_id: r.id,
    embedding: bufferToEmbedding(Buffer.from(r.embedding as Uint8Array)),
  }));

  let searchRes: Response;
  try {
    searchRes = await fetch(`${FACE_SERVICE_URL}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": FACE_SERVICE_API_KEY,
      },
      body: JSON.stringify({
        selfie_s3_key: s3Key,
        selfie_s3_bucket: SELFIE_BUCKET,
        event_id: eventId,
        embeddings,
        threshold: FACE_SIMILARITY_THRESHOLD,
      }),
    });
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).faceSearchSession.update({
      where: { id: session.id },
      data: { status: "FAILED" },
    });
    return { error: (err as Error).message };
  }

  if (!searchRes.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).faceSearchSession.update({
      where: { id: session.id },
      data: { status: "FAILED" },
    });
    return { error: `Face service error (${searchRes.status})` };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await searchRes.json() as any;

  // ── 9. Handle response ─────────────────────────────────────────────────────
  if (!result.query_face_detected) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).faceSearchSession.update({
      where: { id: session.id },
      data: { status: "DONE", matchedPhotoIds: [], matchedClusterIds: [] },
    });
    return { error: "NO_FACE_DETECTED" };
  }

  // Build lookup from face record id → photo + cluster metadata
  const faceMetaById = new Map(
    faceRecords.map((r) => ({
      id: r.id,
      photoId: r.photoId,
      faceClusterId: r.faceClusterId,
    })).map((r) => [r.id, r] as const)
  );

  const matchedPhotoIds: string[] = [];
  const seenPhotoIds = new Set<string>();
  const matchedClusterIdSet = new Set<string>();

  // Filter matches to those above the similarity threshold
  // (the service already applies the threshold, but we enforce it here too)
  for (const match of (result.matches as Array<{ face_record_id: string; similarity: number; is_match: boolean }>)) {
    if (!match.is_match || match.similarity < FACE_SIMILARITY_THRESHOLD) continue;
    const meta = faceMetaById.get(match.face_record_id);
    if (!meta) continue;
    if (!seenPhotoIds.has(meta.photoId)) {
      matchedPhotoIds.push(meta.photoId);
      seenPhotoIds.add(meta.photoId);
    }
    if (meta.faceClusterId) matchedClusterIdSet.add(meta.faceClusterId);
  }

  const matchedClusterIds = [...matchedClusterIdSet];

  // ── 10. Persist results and return ────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).faceSearchSession.update({
    where: { id: session.id },
    data: { status: "DONE", matchedPhotoIds, matchedClusterIds },
  });

  return {
    matchedPhotoIds,
    matchedCount: matchedPhotoIds.length,
    clustersFound: matchedClusterIds.length,
  };
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
