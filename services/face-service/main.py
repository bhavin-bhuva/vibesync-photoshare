import hmac
import os
import random
import time
import uuid
from contextlib import asynccontextmanager

import numpy as np
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
from insightface.app import FaceAnalysis
from pydantic import BaseModel
from scipy.spatial.distance import cdist

from utils.image import bytes_to_rgb_array, crop_and_encode_face, resize_for_detection, rgb_to_bgr
from utils.s3 import download_image_bytes, upload_image_bytes


# ---------------------------------------------------------------------------
# Lifespan: load the model once at startup
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    face_app = FaceAnalysis(
        name="buffalo_l",
        root=os.path.join(os.path.dirname(__file__), "models"),
    )
    # ctx_id=0 uses GPU if available; InsightFace falls back to CPU automatically
    face_app.prepare(ctx_id=0, det_size=(640, 640))
    app.state.face_app = face_app
    yield
    # nothing to clean up


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="Face Recognition Service", lifespan=lifespan)


# ---------------------------------------------------------------------------
# API key middleware
# ---------------------------------------------------------------------------

API_KEY_HEADER = "X-API-Key"

@app.middleware("http")
async def require_api_key(request: Request, call_next):
    # Allow the health check without authentication so load-balancers can probe it
    if request.url.path == "/health":
        return await call_next(request)

    expected = os.environ.get("FACE_SERVICE_API_KEY", "")
    provided = request.headers.get(API_KEY_HEADER, "")

    if not expected:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "FACE_SERVICE_API_KEY is not configured"},
        )

    if not hmac.compare_digest(expected, provided):
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Invalid or missing API key"},
        )

    return await call_next(request)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "model": "buffalo_l"}


# ---------------------------------------------------------------------------
# /index — detect faces in a photo and return embeddings + crops
# ---------------------------------------------------------------------------

DET_SCORE_THRESHOLD = 0.7


class IndexRequest(BaseModel):
    photo_id: str
    event_id: str
    s3_key: str
    s3_bucket: str


class BBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float


class FaceResult(BaseModel):
    face_index: int
    confidence: float
    bbox: BBox
    embedding: list[float]       # 512 ArcFace floats
    crop_s3_key: str


class IndexResponse(BaseModel):
    photo_id: str
    faces: list[FaceResult]
    face_count: int
    processing_ms: int


@app.post("/index", response_model=IndexResponse)
async def index_photo(body: IndexRequest, request: Request):
    face_app: FaceAnalysis = request.app.state.face_app
    started = time.monotonic()

    # 1. Download image bytes from S3 — never touch disk
    try:
        raw = download_image_bytes(body.s3_key, bucket=body.s3_bucket)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"S3 key not found: {body.s3_key}")

    # 2. Decode → RGB numpy array, downscale if needed, convert to BGR for InsightFace
    img_rgb = bytes_to_rgb_array(raw)
    img_rgb = resize_for_detection(img_rgb)
    img_bgr = rgb_to_bgr(img_rgb)

    # 3. Run InsightFace detection + embedding
    faces = face_app.get(img_bgr)

    # 4. Process each face that clears the confidence threshold
    results: list[FaceResult] = []
    for idx, face in enumerate(faces):
        score: float = float(face.det_score)
        if score < DET_SCORE_THRESHOLD:
            continue

        bbox_arr: np.ndarray = face.bbox  # [x1, y1, x2, y2]
        embedding: np.ndarray = face.embedding  # (512,) float32

        # Crop face, encode to JPEG in memory, upload to S3
        crop_bytes = crop_and_encode_face(img_rgb, bbox_arr.tolist())
        crop_key = f"faces/{body.event_id}/{body.photo_id}_{idx}.jpg"
        upload_image_bytes(crop_bytes, crop_key, bucket=body.s3_bucket)

        results.append(
            FaceResult(
                face_index=idx,
                confidence=round(score, 6),
                bbox=BBox(
                    x1=float(bbox_arr[0]),
                    y1=float(bbox_arr[1]),
                    x2=float(bbox_arr[2]),
                    y2=float(bbox_arr[3]),
                ),
                embedding=embedding.tolist(),
                crop_s3_key=crop_key,
            )
        )

    elapsed_ms = int((time.monotonic() - started) * 1000)

    return IndexResponse(
        photo_id=body.photo_id,
        faces=results,
        face_count=len(results),
        processing_ms=elapsed_ms,
    )


# ---------------------------------------------------------------------------
# /search — match a selfie against a set of pre-computed embeddings
# ---------------------------------------------------------------------------

def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    if denom == 0.0:
        return 0.0
    return float(np.dot(a, b) / denom)


def _pick_best_face(faces: list) -> object | None:
    """
    Return the single best face from a detection result.
    Priority: highest det_score; ties broken by largest bbox area.
    Returns None when the list is empty.
    """
    if not faces:
        return None
    return max(
        faces,
        key=lambda f: (
            float(f.det_score),
            (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
        ),
    )


class EmbeddingRecord(BaseModel):
    face_record_id: str
    embedding: list[float]          # 512 ArcFace floats


class SearchRequest(BaseModel):
    selfie_s3_key: str
    selfie_s3_bucket: str
    event_id: str
    embeddings: list[EmbeddingRecord]
    threshold: float = 0.6


class MatchResult(BaseModel):
    face_record_id: str
    similarity: float
    is_match: bool


class SearchResponse(BaseModel):
    matches: list[MatchResult]
    query_face_detected: bool
    total_compared: int
    processing_ms: int


@app.post("/search", response_model=SearchResponse)
async def search_faces(body: SearchRequest, request: Request):
    face_app: FaceAnalysis = request.app.state.face_app
    started = time.monotonic()

    # 1. Download selfie from S3 into memory
    try:
        raw = download_image_bytes(body.selfie_s3_key, bucket=body.selfie_s3_bucket)
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"S3 key not found: {body.selfie_s3_key}",
        )

    # 2. Decode → RGB, downscale, convert to BGR for InsightFace
    img_rgb = bytes_to_rgb_array(raw)
    img_rgb = resize_for_detection(img_rgb)
    img_bgr = rgb_to_bgr(img_rgb)

    # 3. Detect faces; pick the best one
    faces = face_app.get(img_bgr)
    best = _pick_best_face(faces)

    if best is None:
        elapsed_ms = int((time.monotonic() - started) * 1000)
        return SearchResponse(
            matches=[],
            query_face_detected=False,
            total_compared=0,
            processing_ms=elapsed_ms,
        )

    # 4. Build the query embedding as a normalised float32 array
    query_emb: np.ndarray = np.array(best.embedding, dtype=np.float32)

    # 5 & 6. Cosine similarity against every record, filter, sort descending
    matches: list[MatchResult] = []
    for record in body.embeddings:
        candidate = np.array(record.embedding, dtype=np.float32)
        sim = _cosine_similarity(query_emb, candidate)
        if sim >= body.threshold:
            matches.append(
                MatchResult(
                    face_record_id=record.face_record_id,
                    similarity=round(sim, 6),
                    is_match=True,
                )
            )

    matches.sort(key=lambda m: m.similarity, reverse=True)

    elapsed_ms = int((time.monotonic() - started) * 1000)

    return SearchResponse(
        matches=matches,
        query_face_detected=True,
        total_compared=len(body.embeddings),
        processing_ms=elapsed_ms,
    )


# ---------------------------------------------------------------------------
# /cluster — Chinese Whispers face clustering
# ---------------------------------------------------------------------------

def _build_similarity_matrix(embeddings: np.ndarray) -> np.ndarray:
    """
    Compute the full N×N cosine similarity matrix in one vectorised call.
    scipy cdist returns *distances* (1 - cosine_similarity), so we invert.
    Diagonal is forced to 1.0 — distance of a vector to itself is 0 but
    floating-point noise can make it slightly non-zero.
    """
    dist = cdist(embeddings, embeddings, metric="cosine")
    sim = 1.0 - dist
    np.fill_diagonal(sim, 1.0)
    return sim


def _chinese_whispers(
    sim: np.ndarray,
    threshold: float,
    iterations: int = 20,
) -> list[int]:
    """
    Chinese Whispers label propagation on a pre-computed similarity matrix.

    Returns a list of integer labels, one per node, where equal labels mean
    the same cluster.  Labels are arbitrary integers (initial node indices).
    """
    n = sim.shape[0]
    labels = list(range(n))          # each node starts in its own cluster
    indices = list(range(n))

    for _ in range(iterations):
        random.shuffle(indices)
        for i in indices:
            # Gather neighbours that clear the similarity threshold
            votes: dict[int, float] = {}
            for j in range(n):
                if i == j:
                    continue
                weight = sim[i, j]
                if weight <= threshold:
                    continue
                lbl = labels[j]
                votes[lbl] = votes.get(lbl, 0.0) + weight

            if votes:
                labels[i] = max(votes, key=lambda lbl: votes[lbl])

    return labels


def _representative_face(indices_in_cluster: list[int], sim: np.ndarray) -> int:
    """
    Return the index of the face with the highest average cosine similarity
    to every other face in the same cluster.
    """
    if len(indices_in_cluster) == 1:
        return indices_in_cluster[0]
    best_idx, best_avg = indices_in_cluster[0], -1.0
    for i in indices_in_cluster:
        others = [j for j in indices_in_cluster if j != i]
        avg = float(sim[i, others].mean())
        if avg > best_avg:
            best_avg, best_idx = avg, i
    return best_idx


class ClusterFaceInput(BaseModel):
    face_record_id: str
    embedding: list[float]          # 512 ArcFace floats


class ClusterRequest(BaseModel):
    event_id: str
    faces: list[ClusterFaceInput]
    similarity_threshold: float = 0.6


class ClusterInfo(BaseModel):
    cluster_id: str
    face_record_ids: list[str]
    size: int
    representative_face_id: str


class ClusterResponse(BaseModel):
    clusters: list[ClusterInfo]
    total_faces: int
    total_clusters: int
    processing_ms: int


@app.post("/cluster", response_model=ClusterResponse)
async def cluster_faces(body: ClusterRequest):
    started = time.monotonic()

    if not body.faces:
        return ClusterResponse(
            clusters=[],
            total_faces=0,
            total_clusters=0,
            processing_ms=0,
        )

    n = len(body.faces)
    ids = [f.face_record_id for f in body.faces]

    # 1. Stack embeddings into an (N, 512) float32 matrix
    embeddings = np.array(
        [f.embedding for f in body.faces], dtype=np.float32
    )

    # 2. Pre-compute full similarity matrix — O(N² × D) but one vectorised call
    sim = _build_similarity_matrix(embeddings)

    # 3. Run Chinese Whispers — O(iterations × N²) worst case
    labels = _chinese_whispers(sim, body.similarity_threshold)

    # 4. Group indices by label
    label_to_indices: dict[int, list[int]] = {}
    for idx, lbl in enumerate(labels):
        label_to_indices.setdefault(lbl, []).append(idx)

    # 5. Build ClusterInfo for each group, sorted largest-first
    clusters: list[ClusterInfo] = []
    for member_indices in sorted(
        label_to_indices.values(), key=len, reverse=True
    ):
        rep_idx = _representative_face(member_indices, sim)
        clusters.append(
            ClusterInfo(
                cluster_id=str(uuid.uuid4()),
                face_record_ids=[ids[i] for i in member_indices],
                size=len(member_indices),
                representative_face_id=ids[rep_idx],
            )
        )

    elapsed_ms = int((time.monotonic() - started) * 1000)

    return ClusterResponse(
        clusters=clusters,
        total_faces=n,
        total_clusters=len(clusters),
        processing_ms=elapsed_ms,
    )
