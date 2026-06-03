import hmac
import os
import random
import time
import uuid
from contextlib import asynccontextmanager

import cv2
import numpy as np
import open_clip
import torch
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
from insightface.app import FaceAnalysis
from PIL import Image
from pydantic import BaseModel
from scipy.spatial.distance import cdist
from sklearn.cluster import DBSCAN

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

    clip_model, _, clip_preprocess = open_clip.create_model_and_transforms(
        "ViT-B-32", pretrained="openai"
    )
    clip_model.eval()
    app.state.clip_model = clip_model
    app.state.clip_preprocess = clip_preprocess

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


# ---------------------------------------------------------------------------
# /cull/analyze — sharpness scoring + blink detection for photo culling
# ---------------------------------------------------------------------------

def _compute_sharpness(img_bgr: np.ndarray) -> float:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    variance = cv2.Laplacian(gray, cv2.CV_64F).var()
    # < 20 = very blurry, > 500 = very sharp
    return round(min(float(variance) / 500.0, 1.0), 4)


def _compute_ear(eye_kp: np.ndarray, img_bgr: np.ndarray) -> float:
    """
    Estimate eye openness via Variance of Laplacian on a 40×20 eye crop.
    Open eyes have higher texture variance (iris, lashes); closed eyes are smoother.
    Returns 0.0 (closed) – 1.0 (open).
    """
    h, w = img_bgr.shape[:2]
    x, y = int(eye_kp[0]), int(eye_kp[1])
    x1, x2 = max(0, x - 20), min(w, x + 20)
    y1, y2 = max(0, y - 10), min(h, y + 10)
    crop = img_bgr[y1:y2, x1:x2]
    if crop.size == 0:
        return 0.5
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    variance = cv2.Laplacian(gray, cv2.CV_64F).var()
    # Empirically: open eye variance ~50–300, closed ~0–20
    return round(min(float(variance) / 150.0, 1.0), 4)


def _classify_eye(openness: float) -> str:
    if openness < 0.2:
        return "closed"
    if openness < 0.35:
        return "mid"
    return "open"


def _estimate_blink(face, img_bgr: np.ndarray) -> dict:
    """
    kps layout (InsightFace buffalo_l 5-point):
      0 = right eye, 1 = left eye, 2 = nose, 3 = right mouth, 4 = left mouth
    Spec treats kps[0] as left_eye output label, kps[1] as right_eye label —
    the min() for blink_prob makes the labelling inconsequential for culling.
    """
    landmarks = face.kps  # (5, 2) float32
    left_openness = _compute_ear(landmarks[0], img_bgr)
    right_openness = _compute_ear(landmarks[1], img_bgr)
    blink_prob = round(1.0 - min(left_openness, right_openness), 4)
    return {
        "left_eye": _classify_eye(left_openness),
        "right_eye": _classify_eye(right_openness),
        "blink_probability": blink_prob,
    }


class CullAnalyzeRequest(BaseModel):
    photo_id: str
    event_id: str
    thumbnail_s3_key: str
    s3_bucket: str


def _compute_aesthetic_score(img_bgr: np.ndarray) -> float:
    # TODO: replace with full NIMA MobileNet model once nima_mobilenet.pth is integrated
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    brightness = np.mean(gray) / 255.0
    contrast = np.std(gray) / 128.0
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    saturation = np.mean(hsv[:, :, 1]) / 255.0
    raw = brightness * 0.2 + min(float(contrast), 1.0) * 0.4 + saturation * 0.4
    return round(1.0 + raw * 9.0, 2)


class CullAnalyzeResponse(BaseModel):
    photo_id: str
    sharpness_score: float
    face_sharpness_score: float
    blink_probability: float
    left_eye_status: str
    right_eye_status: str
    faces_detected: int
    aesthetic_score: float
    processing_ms: int


@app.post("/cull/analyze", response_model=CullAnalyzeResponse)
async def cull_analyze(body: CullAnalyzeRequest, request: Request):
    face_app: FaceAnalysis = request.app.state.face_app
    started = time.monotonic()

    try:
        raw = download_image_bytes(body.thumbnail_s3_key, bucket=body.s3_bucket)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"S3 key not found: {body.thumbnail_s3_key}")

    img_rgb = bytes_to_rgb_array(raw)
    img_rgb = resize_for_detection(img_rgb)
    img_bgr = rgb_to_bgr(img_rgb)

    # Whole-frame sharpness
    sharpness = _compute_sharpness(img_bgr)

    # Face detection
    faces = face_app.get(img_bgr)
    valid_faces = [f for f in faces if float(f.det_score) >= DET_SCORE_THRESHOLD]

    # Face-region sharpness: use the highest-confidence face
    face_sharpness = sharpness  # fallback when no face detected
    if valid_faces:
        best = max(valid_faces, key=lambda f: float(f.det_score))
        h, w = img_bgr.shape[:2]
        bx1, by1, bx2, by2 = best.bbox
        pad = 10
        fx1 = max(0, int(bx1) - pad)
        fy1 = max(0, int(by1) - pad)
        fx2 = min(w, int(bx2) + pad)
        fy2 = min(h, int(by2) + pad)
        face_crop = img_bgr[fy1:fy2, fx1:fx2]
        if face_crop.size > 0:
            face_sharpness = _compute_sharpness(face_crop)

    # Blink detection: use the best face if available
    if valid_faces:
        best = max(valid_faces, key=lambda f: float(f.det_score))
        blink = _estimate_blink(best, img_bgr)
    else:
        blink = {
            "blink_probability": 0.0,
            "left_eye": "no_face",
            "right_eye": "no_face",
        }

    aesthetic = _compute_aesthetic_score(img_bgr)

    elapsed_ms = int((time.monotonic() - started) * 1000)

    return CullAnalyzeResponse(
        photo_id=body.photo_id,
        sharpness_score=sharpness,
        face_sharpness_score=face_sharpness,
        blink_probability=blink["blink_probability"],
        left_eye_status=blink["left_eye"],
        right_eye_status=blink["right_eye"],
        faces_detected=len(valid_faces),
        aesthetic_score=aesthetic,
        processing_ms=elapsed_ms,
    )


# ---------------------------------------------------------------------------
# /cull/embed — CLIP embedding for burst deduplication
# ---------------------------------------------------------------------------

class CullEmbedRequest(BaseModel):
    photo_id: str
    thumbnail_s3_key: str
    s3_bucket: str


class CullEmbedResponse(BaseModel):
    photo_id: str
    clip_embedding: list[float]   # 512 L2-normalised floats
    processing_ms: int


@app.post("/cull/embed", response_model=CullEmbedResponse)
async def cull_embed(body: CullEmbedRequest, request: Request):
    clip_model = request.app.state.clip_model
    clip_preprocess = request.app.state.clip_preprocess
    started = time.monotonic()

    try:
        raw = download_image_bytes(body.thumbnail_s3_key, bucket=body.s3_bucket)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"S3 key not found: {body.thumbnail_s3_key}")

    img_rgb = bytes_to_rgb_array(raw)
    pil_image = Image.fromarray(img_rgb)

    image_tensor = clip_preprocess(pil_image).unsqueeze(0)
    with torch.no_grad():
        features = clip_model.encode_image(image_tensor)
        features = features / features.norm(dim=-1, keepdim=True)

    embedding: list[float] = features[0].tolist()
    elapsed_ms = int((time.monotonic() - started) * 1000)

    return CullEmbedResponse(
        photo_id=body.photo_id,
        clip_embedding=embedding,
        processing_ms=elapsed_ms,
    )


# ---------------------------------------------------------------------------
# /cull/cluster-bursts — group similar photos into burst clusters via DBSCAN
# ---------------------------------------------------------------------------

class BurstPhotoInput(BaseModel):
    photo_id: str
    embedding: list[float]


class ClusterBurstsRequest(BaseModel):
    event_id: str
    photos: list[BurstPhotoInput]
    similarity_threshold: float = 0.85


class BurstCluster(BaseModel):
    cluster_id: str
    photo_ids: list[str]
    best_photo_id: str
    size: int


class ClusterBurstsResponse(BaseModel):
    event_id: str
    burst_clusters: list[BurstCluster]
    total_clustered: int
    total_unique: int
    processing_ms: int


@app.post("/cull/cluster-bursts", response_model=ClusterBurstsResponse)
async def cluster_bursts(body: ClusterBurstsRequest):
    started = time.monotonic()

    photos = body.photos

    if len(photos) < 2:
        elapsed_ms = int((time.monotonic() - started) * 1000)
        return ClusterBurstsResponse(
            event_id=body.event_id,
            burst_clusters=[],
            total_clustered=0,
            total_unique=len(photos),
            processing_ms=elapsed_ms,
        )

    embeddings = np.array([p.embedding for p in photos], dtype=np.float32)

    # eps = cosine distance threshold; 0.85 similarity → 0.15 distance
    eps = 1.0 - body.similarity_threshold
    labels = DBSCAN(eps=eps, min_samples=2, metric="cosine").fit(embeddings).labels_

    # Group photos by cluster label; label -1 = noise (unique photos)
    label_to_indices: dict[int, list[int]] = {}
    for i, label in enumerate(labels):
        if label == -1:
            continue
        label_to_indices.setdefault(int(label), []).append(i)

    burst_clusters: list[BurstCluster] = []
    for label, indices in label_to_indices.items():
        cluster_embeddings = embeddings[indices]
        # Best photo = highest average cosine similarity to all others in cluster
        # Embeddings are L2-normalised → dot product = cosine similarity
        avg_sims = [
            float(np.mean([np.dot(cluster_embeddings[j], cluster_embeddings[k])
                           for k in range(len(indices)) if k != j]))
            if len(indices) > 1 else 1.0
            for j in range(len(indices))
        ]
        best_local_idx = int(np.argmax(avg_sims))
        photo_ids = [photos[i].photo_id for i in indices]

        burst_clusters.append(BurstCluster(
            cluster_id=str(label),
            photo_ids=photo_ids,
            best_photo_id=photo_ids[best_local_idx],
            size=len(photo_ids),
        ))

    total_clustered = sum(c.size for c in burst_clusters)
    total_unique = len(photos) - total_clustered
    elapsed_ms = int((time.monotonic() - started) * 1000)

    return ClusterBurstsResponse(
        event_id=body.event_id,
        burst_clusters=burst_clusters,
        total_clustered=total_clustered,
        total_unique=total_unique,
        processing_ms=elapsed_ms,
    )
