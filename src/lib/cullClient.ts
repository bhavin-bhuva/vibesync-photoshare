const FACE_SERVICE_URL = process.env.FACE_SERVICE_URL!;
const FACE_SERVICE_API_KEY = process.env.FACE_SERVICE_API_KEY!;

const headers = {
  "Content-Type": "application/json",
  "X-API-Key": FACE_SERVICE_API_KEY,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CullAnalysis {
  photo_id: string;
  sharpness_score: number;
  face_sharpness_score: number;
  blink_probability: number;
  left_eye_status: string;
  right_eye_status: string;
  faces_detected: number;
  aesthetic_score: number;
  processing_ms: number;
}

export interface CullEmbedding {
  photo_id: string;
  clip_embedding: number[]; // 512 L2-normalised floats
  processing_ms: number;
}

export interface BatchPhotoInput {
  photoId: string;
  thumbnailS3Key: string;
}

export interface BatchPhotoResult {
  photo_id: string;
  sharpness_score: number;
  face_sharpness_score: number;
  blink_probability: number;
  left_eye_status: string;
  right_eye_status: string;
  faces_detected: number;
  aesthetic_score: number;
  clip_embedding: number[]; // 512 L2-normalised floats; empty on error
  processing_ms: number;
  error: string | null;
}

export interface BatchAnalysisResult {
  results: BatchPhotoResult[];
  total_photos: number;
  failed_photos: number;
  processing_ms: number;
}

export interface BurstPhotoInput {
  photo_id: string;
  embedding: number[];
}

export interface BurstClusterInfo {
  cluster_id: string;
  photo_ids: string[];
  best_photo_id: string;
  size: number;
}

export interface BurstResult {
  event_id: string;
  burst_clusters: BurstClusterInfo[];
  total_clustered: number;
  total_unique: number;
  processing_ms: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function assertOk(res: Response, context: string): Promise<void> {
  if (res.ok) return;
  let detail = res.statusText;
  try {
    const body = await res.json();
    if (body?.detail) detail = String(body.detail);
  } catch {
    // ignore — body may not be JSON
  }
  throw new Error(`Face service ${context} failed (${res.status}): ${detail}`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function analyzeCull(params: {
  photoId: string;
  eventId: string;
  thumbnailS3Key: string;
  s3Bucket: string;
}): Promise<CullAnalysis> {
  const res = await fetch(`${FACE_SERVICE_URL}/cull/analyze`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      photo_id: params.photoId,
      event_id: params.eventId,
      thumbnail_s3_key: params.thumbnailS3Key,
      s3_bucket: params.s3Bucket,
    }),
  });
  await assertOk(res, "POST /cull/analyze");
  return res.json() as Promise<CullAnalysis>;
}

export async function embedPhoto(params: {
  photoId: string;
  thumbnailS3Key: string;
  s3Bucket: string;
}): Promise<CullEmbedding> {
  const res = await fetch(`${FACE_SERVICE_URL}/cull/embed`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      photo_id: params.photoId,
      thumbnail_s3_key: params.thumbnailS3Key,
      s3_bucket: params.s3Bucket,
    }),
  });
  await assertOk(res, "POST /cull/embed");
  return res.json() as Promise<CullEmbedding>;
}

export async function analyzeBatch(params: {
  photos: BatchPhotoInput[];
  s3Bucket: string;
  batchSize?: number;
}): Promise<BatchAnalysisResult> {
  const res = await fetch(`${FACE_SERVICE_URL}/cull/analyze-batch`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      photos: params.photos.map((p) => ({
        photo_id: p.photoId,
        thumbnail_s3_key: p.thumbnailS3Key,
      })),
      s3_bucket: params.s3Bucket,
      batch_size: params.batchSize ?? 16,
    }),
  });
  await assertOk(res, "POST /cull/analyze-batch");
  return res.json() as Promise<BatchAnalysisResult>;
}

export async function clusterBursts(params: {
  eventId: string;
  photos: BurstPhotoInput[];
  similarityThreshold?: number;
}): Promise<BurstResult> {
  const res = await fetch(`${FACE_SERVICE_URL}/cull/cluster-bursts`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      event_id: params.eventId,
      photos: params.photos,
      similarity_threshold: params.similarityThreshold ?? 0.85,
    }),
  });
  await assertOk(res, "POST /cull/cluster-bursts");
  return res.json() as Promise<BurstResult>;
}
