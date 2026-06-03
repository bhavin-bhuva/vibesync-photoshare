import { AutoSuggestion } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { embeddingToBuffer } from "@/lib/embedding";
import { analyzeCull, embedPhoto } from "@/lib/cullClient";
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

// ─── analyzePhotoForCulling ───────────────────────────────────────────────────

/**
 * Run the full culling pipeline for a single photo:
 * sharpness + blink analysis, CLIP embedding, auto-suggestion, DB upsert.
 *
 * Always called fire-and-forget after upload.
 * Errors here must NOT surface to the upload response.
 */
export async function analyzePhotoForCulling(
  photo: PhotoRef,
  jobId: string,
  options?: CullingOptions
): Promise<void> {
  const thumbnailS3Key = photo.thumbS3Key ?? photo.s3Key;

  // Idempotent: only transitions PENDING → RUNNING; noop when job is already RUNNING
  await db.cullingJob.updateMany({
    where: { id: jobId, status: "PENDING" },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  const [analysis, embedding] = await Promise.all([
    analyzeCull({ photoId: photo.id, eventId: photo.eventId, thumbnailS3Key, s3Bucket: BUCKET }),
    embedPhoto({ photoId: photo.id, thumbnailS3Key, s3Bucket: BUCKET }),
  ]);

  const { suggestion, reason } = computeAutoSuggestion(
    {
      blinkProbability: analysis.blink_probability,
      sharpnessScore: analysis.sharpness_score,
      aestheticScore: analysis.aesthetic_score,
    },
    options
  );

  const clipBuffer = embeddingToBuffer(embedding.clip_embedding);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.photoCullScore.upsert as any)({
    where: { photoId: photo.id },
    create: {
      photoId: photo.id,
      eventId: photo.eventId,
      sharpnessScore: analysis.sharpness_score,
      faceSharpnessScore: analysis.face_sharpness_score,
      blinkProbability: analysis.blink_probability,
      leftEyeStatus: analysis.left_eye_status,
      rightEyeStatus: analysis.right_eye_status,
      aestheticScore: analysis.aesthetic_score,
      facesDetected: analysis.faces_detected,
      clipEmbedding: clipBuffer,
      autoSuggestion: suggestion,
      autoSuggestionReason: reason,
      processedAt: new Date(),
    },
    update: {
      sharpnessScore: analysis.sharpness_score,
      faceSharpnessScore: analysis.face_sharpness_score,
      blinkProbability: analysis.blink_probability,
      leftEyeStatus: analysis.left_eye_status,
      rightEyeStatus: analysis.right_eye_status,
      aestheticScore: analysis.aesthetic_score,
      facesDetected: analysis.faces_detected,
      clipEmbedding: clipBuffer,
      autoSuggestion: suggestion,
      autoSuggestionReason: reason,
      photographerOverride: false,
      processedAt: new Date(),
    },
  });

  await db.cullingJob.update({
    where: { id: jobId },
    data: { processedPhotos: { increment: 1 } },
  });
}
