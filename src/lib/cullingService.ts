import { AutoSuggestion } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { embeddingToBuffer } from "@/lib/embedding";
import { analyzeBatch, type BatchAnalysisResult } from "@/lib/cullClient";
import type { CullingFeature } from "@/lib/storage";

const BUCKET = process.env.AWS_S3_BUCKET_NAME!;

// ─── Types ────────────────────────────────────────────────────────────────────

interface PhotoRef {
  id: string;
  s3Key: string;
  thumbS3Key: string | null;
  eventId: string;
}

interface AutoSuggestionResult {
  suggestion: AutoSuggestion;
  reason: string | null;
}

export type CullingSensitivity = "low" | "medium" | "high";

export interface CullingOptions {
  sensitivity?: CullingSensitivity;
  features?: CullingFeature[];
}

// ─── Sensitivity thresholds ───────────────────────────────────────────────────

const THRESHOLDS: Record<
  CullingSensitivity,
  {
    rejectBlink: number; rejectSharpness: number;
    reviewBlink: number; reviewSharpness: number; reviewAesthetic: number;
  }
> = {
  low:    { rejectBlink: 0.85, rejectSharpness: 0.10, reviewBlink: 0.65, reviewSharpness: 0.25, reviewAesthetic: 2.5 },
  medium: { rejectBlink: 0.75, rejectSharpness: 0.15, reviewBlink: 0.45, reviewSharpness: 0.35, reviewAesthetic: 3.5 },
  high:   { rejectBlink: 0.55, rejectSharpness: 0.25, reviewBlink: 0.30, reviewSharpness: 0.45, reviewAesthetic: 5.0 },
};

// ─── computeAutoSuggestion ────────────────────────────────────────────────────

function computeAutoSuggestion(
  scores: { blinkProbability: number; sharpnessScore: number; aestheticScore: number },
  options?: CullingOptions
): AutoSuggestionResult {
  const { blinkProbability, sharpnessScore, aestheticScore } = scores;
  const sensitivity = options?.sensitivity ?? "medium";
  // Default to all features when no plan restrictions passed
  const features: CullingFeature[] = options?.features ?? ["sharpness", "blink", "aesthetic", "burst"];
  const t = THRESHOLDS[sensitivity];

  if (features.includes("blink")) {
    if (blinkProbability > t.rejectBlink) return { suggestion: "REJECT", reason: "Eyes closed" };
  }
  if (features.includes("sharpness")) {
    if (sharpnessScore < t.rejectSharpness) return { suggestion: "REJECT", reason: "Out of focus" };
  }
  if (features.includes("blink")) {
    if (blinkProbability > t.reviewBlink) return { suggestion: "REVIEW", reason: "Possible blink" };
  }
  if (features.includes("sharpness")) {
    if (sharpnessScore < t.reviewSharpness) return { suggestion: "REVIEW", reason: "Slightly soft" };
  }
  if (features.includes("aesthetic")) {
    if (aestheticScore < t.reviewAesthetic) return { suggestion: "REVIEW", reason: "Low aesthetic" };
  }

  return { suggestion: "KEEP", reason: null };
}

// ─── Batch queue ─────────────────────────────────────────────────────────────

interface QueueEntry {
  photo: PhotoRef;
  jobId: string;
  options: CullingOptions | undefined;
  resolve: () => void;
  reject: (err: unknown) => void;
}

const BATCH_MAX = 20;
const FLUSH_WINDOW_MS = 30_000;

const _queue: QueueEntry[] = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

function _scheduleFlush(): void {
  if (_flushTimer !== null) return;
  _flushTimer = setTimeout(() => { void _flushQueue(); }, FLUSH_WINDOW_MS);
}

async function _flushQueue(): Promise<void> {
  if (_flushTimer !== null) { clearTimeout(_flushTimer); _flushTimer = null; }
  if (_queue.length === 0) return;

  const batch = _queue.splice(0, BATCH_MAX);

  // Transition all affected jobs PENDING → RUNNING
  const uniqueJobIds = [...new Set(batch.map((e) => e.jobId))];
  await Promise.all(
    uniqueJobIds.map((jobId) =>
      db.cullingJob.updateMany({
        where: { id: jobId, status: "PENDING" },
        data: { status: "RUNNING", startedAt: new Date() },
      })
    )
  ).catch(() => {
    // Non-fatal — job stays PENDING but analysis continues
  });

  let batchResponse: BatchAnalysisResult;
  try {
    batchResponse = await analyzeBatch({
      photos: batch.map((e) => ({
        photoId: e.photo.id,
        thumbnailS3Key: e.photo.thumbS3Key ?? e.photo.s3Key,
      })),
      s3Bucket: BUCKET,
    });
  } catch (err) {
    batch.forEach((e) => e.reject(err));
    return;
  }

  const resultMap = new Map(batchResponse.results.map((r) => [r.photo_id, r]));

  await Promise.all(
    batch.map(async (entry) => {
      const result = resultMap.get(entry.photo.id);
      if (!result || result.error !== null) {
        entry.reject(
          new Error(result?.error ?? `No result returned for photo ${entry.photo.id}`)
        );
        return;
      }

      const { suggestion, reason } = computeAutoSuggestion(
        {
          blinkProbability: result.blink_probability,
          sharpnessScore: result.sharpness_score,
          aestheticScore: result.aesthetic_score,
        },
        entry.options
      );

      const clipBuffer = embeddingToBuffer(result.clip_embedding);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db.photoCullScore.upsert as any)({
          where: { photoId: entry.photo.id },
          create: {
            photoId: entry.photo.id,
            eventId: entry.photo.eventId,
            sharpnessScore: result.sharpness_score,
            faceSharpnessScore: result.face_sharpness_score,
            blinkProbability: result.blink_probability,
            leftEyeStatus: result.left_eye_status,
            rightEyeStatus: result.right_eye_status,
            aestheticScore: result.aesthetic_score,
            facesDetected: result.faces_detected,
            clipEmbedding: clipBuffer,
            autoSuggestion: suggestion,
            autoSuggestionReason: reason,
            processedAt: new Date(),
          },
          update: {
            sharpnessScore: result.sharpness_score,
            faceSharpnessScore: result.face_sharpness_score,
            blinkProbability: result.blink_probability,
            leftEyeStatus: result.left_eye_status,
            rightEyeStatus: result.right_eye_status,
            aestheticScore: result.aesthetic_score,
            facesDetected: result.faces_detected,
            clipEmbedding: clipBuffer,
            autoSuggestion: suggestion,
            autoSuggestionReason: reason,
            photographerOverride: false,
            processedAt: new Date(),
          },
        });

        await db.cullingJob.update({
          where: { id: entry.jobId },
          data: { processedPhotos: { increment: 1 } },
        });

        entry.resolve();
      } catch (err) {
        entry.reject(err);
      }
    })
  );
}

// ─── analyzePhotoForCulling ───────────────────────────────────────────────────

/**
 * Enqueue a photo for culling analysis.
 * Batches flush when the queue reaches 20 photos or after a 30-second window,
 * replacing 2N individual HTTP calls with N/20 batched calls.
 *
 * Always called fire-and-forget after upload.
 * Errors here must NOT surface to the upload response.
 */
export function analyzePhotoForCulling(
  photo: PhotoRef,
  jobId: string,
  options?: CullingOptions
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    _queue.push({ photo, jobId, options, resolve, reject });
    if (_queue.length >= BATCH_MAX) {
      void _flushQueue();
    } else {
      _scheduleFlush();
    }
  });
}
