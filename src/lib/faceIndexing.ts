import { db } from "@/lib/db";
import { indexPhotoFaces, clusterEventFaces } from "@/lib/faceService";
import { embeddingToBuffer } from "@/lib/embedding";

const CLUSTERING_DEBOUNCE_MS = 60_000;
const BUCKET = process.env.AWS_S3_BUCKET_NAME!;

// ─── Shared face-record create helper ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function saveFaceRecords(photoId: string, eventId: string, faces: any[]) {
  if (faces.length === 0) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.faceRecord.createMany as any)({
    data: faces.map((face) => ({
      photoId,
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface PhotoRef {
  id: string;
  s3Key: string;
  eventId: string;
}

// ─── processSinglePhotoFaces ──────────────────────────────────────────────────

/**
 * Run InsightFace detection on one photo, persist FaceRecord rows, and
 * kick off a re-cluster pass for the event.
 *
 * This is always called fire-and-forget from `completeMultipartUpload`.
 * Errors here must NOT surface to the upload response.
 */
export async function processSinglePhotoFaces(
  photo: PhotoRef,
  jobId: string
): Promise<void> {
  // Mark job as running
  await db.faceIndexingJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  try {
    const result = await indexPhotoFaces({
      photoId: photo.id,
      eventId: photo.eventId,
      s3Key: photo.s3Key,
      s3Bucket: BUCKET,
    });

    await saveFaceRecords(photo.id, photo.eventId, result.faces);

    await db.faceIndexingJob.update({
      where: { id: jobId },
      data: {
        status: "DONE",
        processedPhotos: 1,
        facesFound: result.face_count,
        completedAt: new Date(),
      },
    });

    // Re-cluster only if we actually found new faces
    if (result.face_count > 0) {
      triggerEventClustering(photo.eventId).catch((err) => {
        console.error("[faceIndexing] Clustering failed:", err);
      });
    }
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

// ─── runEventClustering (internal, no debounce) ───────────────────────────────

async function runEventClustering(eventId: string): Promise<void> {
  const allFaces = await db.faceRecord.findMany({
    where: { eventId },
    select: { id: true, photoId: true, cropS3Key: true },
  });

  if (allFaces.length === 0) return;

  const faceMetaById = new Map(
    allFaces.map((f) => [f.id, { photoId: f.photoId, cropS3Key: f.cropS3Key }])
  );

  const result = await clusterEventFaces({ eventId });

  await db.$transaction(
    async (tx) => {
      await tx.faceRecord.updateMany({ where: { eventId }, data: { faceClusterId: null } });
      await tx.faceCluster.deleteMany({ where: { eventId } });

      for (const cluster of result.clusters) {
        const repMeta = faceMetaById.get(cluster.representative_face_id);
        if (!repMeta) continue;

        const uniquePhotoCount = new Set(
          cluster.face_record_ids
            .map((id) => faceMetaById.get(id)?.photoId)
            .filter((pid): pid is string => pid !== undefined)
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (tx.event.update as any)({
        where: { id: eventId },
        data: { lastClusteredAt: new Date() },
      });
    },
    { timeout: 30_000 }
  );
}

// ─── triggerEventClustering (public, debounced) ───────────────────────────────

/**
 * Debounced entry point used by per-photo indexing.
 * Skips silently if clustering ran within the last 60 seconds.
 */
export async function triggerEventClustering(eventId: string): Promise<void> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { lastClusteredAt: true },
  });

  if (event?.lastClusteredAt) {
    const elapsed = Date.now() - event.lastClusteredAt.getTime();
    if (elapsed < CLUSTERING_DEBOUNCE_MS) return;
  }

  await runEventClustering(eventId);
}

// ─── processEventPhotosFaces (full event rescan) ──────────────────────────────

/**
 * Index every READY photo in an event from scratch, then cluster all faces.
 * Always called fire-and-forget from server actions; never awaited by a request.
 */
export async function processEventPhotosFaces(
  eventId: string,
  jobId: string
): Promise<void> {
  const photos = await db.photo.findMany({
    where: { eventId, status: "READY" },
    select: { id: true, s3Key: true },
  });

  await db.faceIndexingJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", totalPhotos: photos.length, startedAt: new Date() },
  });

  // Wipe existing face data — full rescan starts from scratch
  await db.faceCluster.deleteMany({ where: { eventId } });
  await db.faceRecord.deleteMany({ where: { eventId } });

  let processedPhotos = 0;
  let facesFound = 0;

  for (const photo of photos) {
    try {
      const result = await indexPhotoFaces({
        photoId: photo.id,
        eventId,
        s3Key: photo.s3Key,
        s3Bucket: BUCKET,
      });

      await saveFaceRecords(photo.id, eventId, result.faces);
      facesFound += result.face_count;
    } catch (err) {
      console.error(`[faceIndexing] Skipping photo ${photo.id}:`, err);
    }

    processedPhotos++;

    // Flush progress every 10 photos so the UI poll sees live updates
    if (processedPhotos % 10 === 0) {
      await db.faceIndexingJob.update({
        where: { id: jobId },
        data: { processedPhotos, facesFound },
      });
    }
  }

  // Transition: indexing done, now cluster
  await db.faceIndexingJob.update({
    where: { id: jobId },
    data: { status: "CLUSTERING", processedPhotos, facesFound },
  });

  try {
    await runEventClustering(eventId); // bypass debounce — we own this job
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
  }
}
