import { db } from "@/lib/db";
import { bufferToEmbedding } from "@/lib/embedding";

const FACE_SERVICE_URL = process.env.FACE_SERVICE_URL!;
const FACE_SERVICE_API_KEY = process.env.FACE_SERVICE_API_KEY!;

const headers = {
  "Content-Type": "application/json",
  "X-API-Key": FACE_SERVICE_API_KEY,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IndexedFace {
  face_index: number;
  confidence: number;
  bbox: { x1: number; y1: number; x2: number; y2: number };
  embedding: number[];   // 512 floats
  crop_s3_key: string;
}

export interface IndexResult {
  photo_id: string;
  faces: IndexedFace[];
  face_count: number;
  processing_ms: number;
}

export interface FaceMatch {
  face_record_id: string;
  similarity: number;
  is_match: boolean;
}

export interface SearchResult {
  matches: FaceMatch[];
  query_face_detected: boolean;
  total_compared: number;
  processing_ms: number;
}

export interface ClusterInfo {
  cluster_id: string;           // UUID from the Python service (not persisted as-is)
  face_record_ids: string[];
  size: number;
  representative_face_id: string;
}

export interface ClusterResult {
  clusters: ClusterInfo[];
  total_faces: number;
  total_clusters: number;
  processing_ms: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Throw a descriptive error when the face service returns a non-2xx status.
 * Attempts to parse the JSON `detail` field that FastAPI puts in error responses.
 */
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

/**
 * Detect faces in a single photo and return their embeddings + crop S3 keys.
 * The caller is responsible for persisting the returned FaceRecord data.
 */
export async function indexPhotoFaces(params: {
  photoId: string;
  eventId: string;
  s3Key: string;
  s3Bucket: string;
}): Promise<IndexResult> {
  const res = await fetch(`${FACE_SERVICE_URL}/index`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      photo_id: params.photoId,
      event_id: params.eventId,
      s3_key: params.s3Key,
      s3_bucket: params.s3Bucket,
    }),
  });
  await assertOk(res, "POST /index");
  return res.json() as Promise<IndexResult>;
}

/**
 * Match a selfie against all FaceRecords in an event.
 *
 * Fetches every embedding for the event from the DB (binary → float32 array),
 * sends them to the Python /search endpoint, and returns the ranked matches.
 */
export async function searchFaceInEvent(params: {
  selfieS3Key: string;
  selfieS3Bucket: string;
  eventId: string;
  threshold?: number;
}): Promise<SearchResult> {
  // Pull every face embedding for this event from the DB
  const records = await db.faceRecord.findMany({
    where: { eventId: params.eventId },
    select: { id: true, embedding: true },
  });

  const embeddings = records.map((r) => ({
    face_record_id: r.id,
    embedding: bufferToEmbedding(Buffer.from(r.embedding)),
  }));

  const res = await fetch(`${FACE_SERVICE_URL}/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      selfie_s3_key: params.selfieS3Key,
      selfie_s3_bucket: params.selfieS3Bucket,
      event_id: params.eventId,
      embeddings,
      threshold: params.threshold ?? 0.6,
    }),
  });
  await assertOk(res, "POST /search");
  return res.json() as Promise<SearchResult>;
}

/**
 * Run Chinese Whispers clustering over all faces in an event.
 *
 * Fetches every embedding from the DB, sends them to /cluster, and returns
 * the raw cluster assignments.  The caller is responsible for persisting
 * FaceCluster rows and updating FaceRecord.faceClusterId.
 */
export async function clusterEventFaces(params: {
  eventId: string;
  similarityThreshold?: number;
}): Promise<ClusterResult> {
  const records = await db.faceRecord.findMany({
    where: { eventId: params.eventId },
    select: { id: true, embedding: true },
  });

  const faces = records.map((r) => ({
    face_record_id: r.id,
    embedding: bufferToEmbedding(Buffer.from(r.embedding)),
  }));

  const res = await fetch(`${FACE_SERVICE_URL}/cluster`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      event_id: params.eventId,
      faces,
      similarity_threshold: params.similarityThreshold ?? 0.6,
    }),
  });
  await assertOk(res, "POST /cluster");
  return res.json() as Promise<ClusterResult>;
}

/**
 * Ping the face service health endpoint.
 * Returns true if the service is up, false on any error.
 * Used by the admin health dashboard.
 */
export async function checkFaceServiceHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${FACE_SERVICE_URL}/health`, {
      // No API key — /health is intentionally unauthenticated
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
