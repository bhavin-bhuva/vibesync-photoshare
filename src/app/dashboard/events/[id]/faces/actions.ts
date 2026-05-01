"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { indexPhotoFaces, clusterEventFaces } from "@/lib/faceService";
import { embeddingToBuffer } from "@/lib/embedding";

// ─── Constants ────────────────────────────────────────────────────────────────

const BATCH_SIZE = 10;
const BUCKET = process.env.AWS_S3_BUCKET_NAME!;

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function requireEventOwner(
  eventId: string
): Promise<{ id: string } | { error: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const event = await db.event.findFirst({
    where: { id: eventId, userId: session.user.id },
    select: { id: true },
  });

  return event ?? { error: "Event not found." };
}

async function requireClusterOwner(
  clusterId: string
): Promise<{ id: string; isHidden: boolean } | { error: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized." };

  const cluster = await db.faceCluster.findFirst({
    where: { id: clusterId, event: { userId: session.user.id } },
    select: { id: true, isHidden: true },
  });

  return cluster ?? { error: "Cluster not found." };
}

// ─── 1. enableFaceIndexing ────────────────────────────────────────────────────

/**
 * Set faceIndexingEnabled = true and kick off a full background rescan of all
 * existing photos in the event.  Returns immediately — processing is async.
 */
export async function enableFaceIndexing(
  eventId: string
): Promise<{ error?: string }> {
  const auth = await requireEventOwner(eventId);
  if ("error" in auth) return auth;

  await db.event.update({
    where: { id: eventId },
    data: { faceIndexingEnabled: true },
  });

  const photoCount = await db.photo.count({
    where: { eventId, status: "READY" },
  });

  if (photoCount > 0) {
    const job = await db.faceIndexingJob.create({
      data: { eventId, status: "PENDING", totalPhotos: photoCount },
      select: { id: true },
    });

    // Fire-and-forget — must not block the server action response
    processAllEventPhotos(eventId, job.id).catch((err: Error) =>
      console.error("[enableFaceIndexing] Background job failed:", err.message)
    );
  }

  return {};
}

// ─── 2. processAllEventPhotos ─────────────────────────────────────────────────

/**
 * Full event re-index.  Processes photos in parallel batches of BATCH_SIZE,
 * persists FaceRecord rows for every detected face, then clusters the results.
 *
 * Called fire-and-forget from enableFaceIndexing; also exported so callers can
 * trigger a rescan directly (e.g. from a "Re-scan" button action).
 */
export async function processAllEventPhotos(
  eventId: string,
  jobId: string
): Promise<void> {
  const photos = await db.photo.findMany({
    where: { eventId, status: "READY" },
    select: { id: true, s3Key: true },
  });

  // Update job with final photo count and mark running
  await db.faceIndexingJob.update({
    where: { id: jobId },
    data: {
      status: "RUNNING",
      totalPhotos: photos.length,
      startedAt: new Date(),
    },
  });

  // Wipe existing face data before a full re-index
  await db.faceCluster.deleteMany({ where: { eventId } });
  await db.faceRecord.deleteMany({ where: { eventId } });

  let processedPhotos = 0;
  let facesFound = 0;

  for (let i = 0; i < photos.length; i += BATCH_SIZE) {
    const batch = photos.slice(i, i + BATCH_SIZE);

    // Process each photo in the batch in parallel
    const batchResults = await Promise.allSettled(
      batch.map(async (photo) => {
        const result = await indexPhotoFaces({
          photoId: photo.id,
          eventId,
          s3Key: photo.s3Key,
          s3Bucket: BUCKET,
        });

        if (result.faces.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (db.faceRecord.createMany as any)({
            data: result.faces.map((face) => ({
              photoId: photo.id,
              eventId,
              faceIndex: face.face_index,
              confidence: face.confidence,
              boundingBoxX1: face.bbox.x1,
              boundingBoxY1: face.bbox.y1,
              boundingBoxX2: face.bbox.x2,
              boundingBoxY2: face.bbox.y2,
              cropS3Key: face.crop_s3_key,
              embedding: embeddingToBuffer(face.embedding),
            })),
          });
        }

        return result.face_count;
      })
    );

    // Tally results; log individual failures without aborting the batch
    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        facesFound += result.value;
      } else {
        console.error(
          "[processAllEventPhotos] Photo in batch failed:",
          result.reason
        );
      }
    }

    processedPhotos += batch.length;

    // Flush progress after every batch so the UI poll sees live updates
    await db.faceIndexingJob.update({
      where: { id: jobId },
      data: { processedPhotos, facesFound },
    });
  }

  // Transition to the clustering phase
  await db.faceIndexingJob.update({
    where: { id: jobId },
    data: { status: "CLUSTERING", processedPhotos, facesFound },
  });

  try {
    await clusterAllEventFaces(eventId);
    await db.faceIndexingJob.update({
      where: { id: jobId },
      data: { status: "DONE", completedAt: new Date() },
    });
  } catch (err) {
    await db.faceIndexingJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      },
    });
    throw err;
  }
}

// ─── 3. clusterAllEventFaces ──────────────────────────────────────────────────

/**
 * Run Chinese Whispers clustering on all FaceRecords for an event and persist
 * the resulting FaceCluster rows.
 *
 * Strategy:
 *   1. Capture the IDs of any existing clusters (stale after re-clustering).
 *   2. Call the Python clustering service.
 *   3. In a transaction: create new clusters, assign FaceRecord FKs to them,
 *      then delete the stale clusters captured in step 1.
 *
 * This order ensures FaceRecords always reference valid cluster rows and that
 * any photographer-set labels on previous clusters are cleanly superseded.
 */
export async function clusterAllEventFaces(eventId: string): Promise<void> {
  // Metadata needed to resolve cluster info from the Python response
  const allFaces = await db.faceRecord.findMany({
    where: { eventId },
    select: { id: true, photoId: true, cropS3Key: true },
  });

  if (allFaces.length === 0) return;

  const faceMetaById = new Map(
    allFaces.map((f) => [f.id, { photoId: f.photoId, cropS3Key: f.cropS3Key }])
  );

  // Capture existing cluster IDs *before* creating new ones so we can delete
  // them after the new assignments are in place.
  const staleClusterIds = await db.faceCluster
    .findMany({ where: { eventId }, select: { id: true } })
    .then((rows) => rows.map((r) => r.id));

  // Run clustering via the Python face service
  const result = await clusterEventFaces({ eventId });

  await db.$transaction(
    async (tx) => {
      // Create new FaceCluster rows and assign FaceRecord FKs
      for (const cluster of result.clusters) {
        const repMeta = faceMetaById.get(cluster.representative_face_id);
        if (!repMeta) continue;

        const uniquePhotoCount = new Set(
          cluster.face_record_ids
            .map((id) => faceMetaById.get(id)?.photoId)
            .filter((pid): pid is string => Boolean(pid))
        ).size;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newCluster = await (tx.faceCluster.create as any)({
          data: {
            eventId,
            coverCropS3Key: repMeta.cropS3Key,
            faceCount: cluster.size,
            photoCount: uniquePhotoCount,
          },
          select: { id: true },
        });

        await tx.faceRecord.updateMany({
          where: { id: { in: cluster.face_record_ids } },
          data: { faceClusterId: newCluster.id },
        });
      }

      // Null out any FK references still pointing to stale clusters (faces that
      // were not assigned to any cluster in this run), then delete them.
      if (staleClusterIds.length > 0) {
        await tx.faceRecord.updateMany({
          where: { faceClusterId: { in: staleClusterIds } },
          data: { faceClusterId: null },
        });
        await tx.faceCluster.deleteMany({
          where: { id: { in: staleClusterIds } },
        });
      }

      await tx.event.update({
        where: { id: eventId },
        data: { lastClusteredAt: new Date() },
      });
    },
    { timeout: 30_000 }
  );
}

// ─── 4. updateClusterLabel ────────────────────────────────────────────────────

export async function updateClusterLabel(
  clusterId: string,
  label: string
): Promise<{ error?: string }> {
  const auth = await requireClusterOwner(clusterId);
  if ("error" in auth) return auth;

  await db.faceCluster.update({
    where: { id: clusterId },
    data: { label: label.trim() || null },
  });

  return {};
}

// ─── 5. toggleClusterVisibility ───────────────────────────────────────────────

export async function toggleClusterVisibility(
  clusterId: string
): Promise<{ isHidden?: boolean; error?: string }> {
  const auth = await requireClusterOwner(clusterId);
  if ("error" in auth) return auth;

  const updated = await db.faceCluster.update({
    where: { id: clusterId },
    data: { isHidden: !auth.isHidden },
    select: { isHidden: true },
  });

  return { isHidden: updated.isHidden };
}

// ─── 6. getIndexingJobProgress ────────────────────────────────────────────────

export type JobProgress = {
  id: string;
  status: string;
  totalPhotos: number;
  processedPhotos: number;
  facesFound: number;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
} | null;

/**
 * Return the most recent FaceIndexingJob for an event.
 * Intended for polling — called every few seconds while a job is running.
 */
export async function getIndexingJobProgress(
  eventId: string
): Promise<{ job: JobProgress; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session) return { job: null, error: "Unauthorized." };

  // Ownership check — never leak job info for events the user doesn't own
  const event = await db.event.findFirst({
    where: { id: eventId, userId: session.user.id },
    select: { id: true },
  });
  if (!event) return { job: null, error: "Event not found." };

  const job = await db.faceIndexingJob.findFirst({
    where: { eventId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      totalPhotos: true,
      processedPhotos: true,
      facesFound: true,
      errorMessage: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
    },
  });

  return {
    job: job
      ? { ...job, status: job.status as string }
      : null,
  };
}
