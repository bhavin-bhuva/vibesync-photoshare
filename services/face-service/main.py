import asyncio
import gc
import hmac
import os
import random
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

import aioboto3
import cv2
import numpy as np
import onnxruntime as ort
import psutil
import torch
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
from insightface.app import FaceAnalysis
from PIL import Image
from pydantic import BaseModel
from scipy.spatial.distance import cdist
from sklearn.cluster import DBSCAN
from torchvision import transforms as T

from utils.image import (
    bytes_to_rgb_array,
    crop_and_encode_face,
    load_image_for_inference,
    release_image,
    resize_for_detection,
    rgb_to_bgr,
)
from utils.s3 import download_image_bytes, upload_image_bytes

# Cached process handle for memory monitoring (avoids per-request pid lookup)
_process = psutil.Process()

# Preprocessing pipelines (no model weights loaded at import time)
_CLIP_PREPROCESS = T.Compose([
    T.Resize(224, interpolation=T.InterpolationMode.BICUBIC),
    T.CenterCrop(224),
    T.ToTensor(),
    T.Normalize(mean=(0.48145466, 0.4578275, 0.40821073), std=(0.26862954, 0.26130258, 0.27577711)),
])

_NIMA_PREPROCESS = T.Compose([
    T.Resize(256, interpolation=T.InterpolationMode.BILINEAR),
    T.CenterCrop(224),
    T.ToTensor(),
    T.Normalize(mean=(0.485, 0.456, 0.406), std=(0.229, 0.224, 0.225)),
])

_ORT_WEIGHTS_RATING = np.arange(1, 11, dtype=np.float32)


def _make_ort_session(model_path: str) -> ort.InferenceSession:
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 2
    opts.inter_op_num_threads = 1
    opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    return ort.InferenceSession(model_path, opts, providers=["CPUExecutionProvider"])


# ---------------------------------------------------------------------------
# Inference queue — serialises single-photo requests to cap concurrency
# ---------------------------------------------------------------------------

@dataclass
class InferenceJob:
    job_id: str
    photo_id: str
    thumbnail_s3_key: str
    s3_bucket: str
    result: dict | None = None
    error: str | None = None
    done: asyncio.Event = field(default_factory=asyncio.Event)


class InferenceQueue:
    """
    Bounded async queue with N worker tasks.  Limits how many photos are
    decoded and run through InsightFace/CLIP at once, preventing memory spikes
    when many uploads arrive simultaneously.

    50 concurrent uploads → all queued → 2 workers process sequentially →
    no OOM, predictable peak RSS, first job completes in ~5 s.
    """

    def __init__(self, num_workers: int = 2, maxsize: int = 500) -> None:
        self._queue: asyncio.Queue[InferenceJob] = asyncio.Queue(maxsize=maxsize)
        self._num_workers = num_workers
        # Inference dependencies injected at start_workers time
        self._face_app: FaceAnalysis | None = None
        self._clip_session: ort.InferenceSession | None = None
        self._nima_session: ort.InferenceSession | None = None
        self._aioboto3_session = None

    async def start_workers(
        self,
        face_app: FaceAnalysis,
        clip_session: ort.InferenceSession,
        nima_session: ort.InferenceSession | None,
        aioboto3_session,
    ) -> None:
        self._face_app = face_app
        self._clip_session = clip_session
        self._nima_session = nima_session
        self._aioboto3_session = aioboto3_session
        for i in range(self._num_workers):
            asyncio.create_task(self._worker(f"worker-{i}"))

    async def _worker(self, name: str) -> None:
        print(f"Inference {name} started")
        while True:
            job: InferenceJob = await self._queue.get()
            try:
                job.result = await _run_single_inference(
                    photo_id=job.photo_id,
                    thumbnail_s3_key=job.thumbnail_s3_key,
                    s3_bucket=job.s3_bucket,
                    face_app=self._face_app,
                    clip_session=self._clip_session,
                    nima_session=self._nima_session,
                    aioboto3_session=self._aioboto3_session,
                )
            except Exception as exc:
                job.error = str(exc)
            finally:
                job.done.set()
                self._queue.task_done()

    async def submit(self, job: InferenceJob) -> dict:
        try:
            self._queue.put_nowait(job)
        except asyncio.QueueFull:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Inference queue full ({self._queue.maxsize} jobs) — retry later",
            )
        await job.done.wait()
        if job.error:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=job.error,
            )
        return job.result  # type: ignore[return-value]

    @property
    def depth(self) -> int:
        return self._queue.qsize()


async def _run_single_inference(
    *,
    photo_id: str,
    thumbnail_s3_key: str,
    s3_bucket: str,
    face_app: FaceAnalysis,
    clip_session: ort.InferenceSession,
    nima_session: ort.InferenceSession | None,
    aioboto3_session,
) -> dict:
    """Download, decode, and score a single photo. Called only from queue workers."""
    started = time.monotonic()

    async with aioboto3_session.client(
        "s3", region_name=os.environ.get("AWS_REGION")
    ) as s3_client:
        img_bgr, err = await _download_image_async(thumbnail_s3_key, s3_bucket, s3_client)

    if img_bgr is None:
        raise FileNotFoundError(f"S3 key not found: {thumbnail_s3_key}: {err}")

    try:
        sharpness = _compute_sharpness(img_bgr)
        faces = face_app.get(img_bgr)
        valid_faces = [f for f in faces if float(f.det_score) >= DET_SCORE_THRESHOLD]

        face_sharpness = sharpness
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

        if valid_faces:
            best = max(valid_faces, key=lambda f: float(f.det_score))
            blink = _estimate_blink(best, img_bgr)
        else:
            blink = {"blink_probability": 0.0, "left_eye": "no_face", "right_eye": "no_face"}

        return {
            "photo_id": photo_id,
            "sharpness_score": sharpness,
            "face_sharpness_score": face_sharpness,
            "blink_probability": blink["blink_probability"],
            "left_eye_status": blink["left_eye"],
            "right_eye_status": blink["right_eye"],
            "faces_detected": len(valid_faces),
            "aesthetic_score": _compute_aesthetic_score(img_bgr, nima_session),
            "processing_ms": int((time.monotonic() - started) * 1000),
        }
    finally:
        release_image(img_bgr)


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

    clip_path = "/app/models/clip_visual_int8.onnx"
    app.state.clip_session = _make_ort_session(clip_path)

    nima_path = "/app/models/nima_int8.onnx"
    app.state.nima_session = _make_ort_session(nima_path) if os.path.exists(nima_path) else None

    app.state.aioboto3_session = aioboto3.Session()

    inference_queue = InferenceQueue(num_workers=2)
    await inference_queue.start_workers(
        face_app=face_app,
        clip_session=app.state.clip_session,
        nima_session=app.state.nima_session,
        aioboto3_session=app.state.aioboto3_session,
    )
    app.state.inference_queue = inference_queue

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


_MEM_SPIKE_THRESHOLD_MB = 200
_MEM_EMERGENCY_GC_MB = 3000


@app.middleware("http")
async def memory_guard(request: Request, call_next):
    mem_before = _process.memory_info().rss / 1024 / 1024

    response = await call_next(request)

    mem_after = _process.memory_info().rss / 1024 / 1024
    delta = mem_after - mem_before

    if delta > _MEM_SPIKE_THRESHOLD_MB:
        print(f"WARNING: Memory spike {mem_before:.0f}MB → {mem_after:.0f}MB (+{delta:.0f}MB) on {request.url.path}")

    if mem_after > _MEM_EMERGENCY_GC_MB:
        gc.collect()
        print(f"Emergency GC triggered at {mem_after:.0f}MB")

    return response


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health(request: Request):
    mem = _process.memory_info()
    queue: InferenceQueue = request.app.state.inference_queue
    return {
        "status": "ok",
        "model": "buffalo_l",
        "memory_mb": round(mem.rss / 1024 / 1024, 1),
        "memory_percent": psutil.virtual_memory().percent,
        "queue_depth": queue.depth,
    }


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


def _compute_aesthetic_score(img_bgr: np.ndarray, nima_session: ort.InferenceSession | None = None) -> float:
    if nima_session is not None:
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(img_rgb)
        image_np = _NIMA_PREPROCESS(pil_img).unsqueeze(0).numpy()
        scores: np.ndarray = nima_session.run(["scores"], {"image": image_np})[0][0]
        return round(float(np.dot(scores, _ORT_WEIGHTS_RATING)), 2)

    # Heuristic fallback when NIMA weights are not available
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
    queue: InferenceQueue = request.app.state.inference_queue
    job = InferenceJob(
        job_id=str(uuid.uuid4()),
        photo_id=body.photo_id,
        thumbnail_s3_key=body.thumbnail_s3_key,
        s3_bucket=body.s3_bucket,
    )
    return await queue.submit(job)


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
    clip_session: ort.InferenceSession = request.app.state.clip_session
    started = time.monotonic()

    try:
        raw = download_image_bytes(body.thumbnail_s3_key, bucket=body.s3_bucket)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"S3 key not found: {body.thumbnail_s3_key}")

    img_rgb = bytes_to_rgb_array(raw)
    pil_image = Image.fromarray(img_rgb)

    image_np = _CLIP_PREPROCESS(pil_image).unsqueeze(0).numpy()
    raw_embedding: np.ndarray = clip_session.run(["embedding"], {"image": image_np})[0][0]
    norm = np.linalg.norm(raw_embedding)
    features = raw_embedding / norm if norm > 0 else raw_embedding

    embedding: list[float] = features.tolist()
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


# ---------------------------------------------------------------------------
# /cull/analyze-batch — combined analyze + embed for multiple photos
# ---------------------------------------------------------------------------

async def _download_image_async(
    s3_key: str, bucket: str, s3_client
) -> tuple[np.ndarray | None, str | None]:
    """Download and decode to a BGR array at MAX_INFERENCE_SIZE (640px) immediately."""
    try:
        resp = await s3_client.get_object(Bucket=bucket, Key=s3_key)
        data = await resp["Body"].read()
        return load_image_for_inference(data), None
    except Exception as exc:
        return None, str(exc)


class BatchPhotoInput(BaseModel):
    photo_id: str
    thumbnail_s3_key: str


class AnalyzeBatchRequest(BaseModel):
    photos: list[BatchPhotoInput]
    s3_bucket: str
    batch_size: int = 16


class BatchPhotoResult(BaseModel):
    photo_id: str
    sharpness_score: float
    face_sharpness_score: float
    blink_probability: float
    left_eye_status: str
    right_eye_status: str
    faces_detected: int
    aesthetic_score: float
    clip_embedding: list[float]   # 512 L2-normalised floats; empty on error
    processing_ms: int
    error: str | None = None


class AnalyzeBatchResponse(BaseModel):
    results: list[BatchPhotoResult]
    total_photos: int
    failed_photos: int
    processing_ms: int


@app.post("/cull/analyze-batch", response_model=AnalyzeBatchResponse)
async def cull_analyze_batch(body: AnalyzeBatchRequest, request: Request):
    face_app: FaceAnalysis = request.app.state.face_app
    clip_session: ort.InferenceSession = request.app.state.clip_session
    nima_session: ort.InferenceSession | None = request.app.state.nima_session
    aioboto3_session = request.app.state.aioboto3_session
    started = time.monotonic()

    results: list[BatchPhotoResult] = []
    failed = 0

    async with aioboto3_session.client(
        "s3", region_name=os.environ.get("AWS_REGION")
    ) as s3_client:
        for i in range(0, len(body.photos), body.batch_size):
            mini_batch = body.photos[i : i + body.batch_size]

            # Download all images in mini-batch concurrently
            download_results: list[tuple[np.ndarray | None, str | None]] = (
                await asyncio.gather(*[
                    _download_image_async(p.thumbnail_s3_key, body.s3_bucket, s3_client)
                    for p in mini_batch
                ])
            )

            valid_indices: list[int] = []
            valid_images: list[np.ndarray] = []
            for idx, (img, err) in enumerate(download_results):
                if img is not None:
                    valid_indices.append(idx)
                    valid_images.append(img)
                else:
                    results.append(BatchPhotoResult(
                        photo_id=mini_batch[idx].photo_id,
                        sharpness_score=0.0,
                        face_sharpness_score=0.0,
                        blink_probability=0.0,
                        left_eye_status="error",
                        right_eye_status="error",
                        faces_detected=0,
                        aesthetic_score=0.0,
                        clip_embedding=[],
                        processing_ms=0,
                        error=err,
                    ))
                    failed += 1

            if valid_images:
                # CLIP batch inference — one ORT call for the whole mini-batch.
                # valid_images are BGR; flip to RGB for the CLIP preprocessor.
                clip_inputs = np.stack([
                    _CLIP_PREPROCESS(
                        Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
                    ).numpy()
                    for img in valid_images
                ])  # (N, 3, 224, 224)
                raw_embeddings: np.ndarray = clip_session.run(
                    ["embedding"], {"image": clip_inputs}
                )[0]  # (N, 512)
                norms = np.linalg.norm(raw_embeddings, axis=1, keepdims=True)
                clip_embeddings = raw_embeddings / np.where(norms > 0, norms, 1.0)

                # Per-image InsightFace + scoring (no batch API in InsightFace).
                # Images are already BGR — no conversion needed.
                for j, (photo_idx, img_bgr) in enumerate(zip(valid_indices, valid_images)):
                    photo = mini_batch[photo_idx]
                    photo_started = time.monotonic()

                    sharpness = _compute_sharpness(img_bgr)
                    faces = face_app.get(img_bgr)
                    valid_faces = [f for f in faces if float(f.det_score) >= DET_SCORE_THRESHOLD]

                    face_sharpness = sharpness
                    if valid_faces:
                        best_face = max(valid_faces, key=lambda f: float(f.det_score))
                        h, w = img_bgr.shape[:2]
                        bx1, by1, bx2, by2 = best_face.bbox
                        pad = 10
                        fx1 = max(0, int(bx1) - pad)
                        fy1 = max(0, int(by1) - pad)
                        fx2 = min(w, int(bx2) + pad)
                        fy2 = min(h, int(by2) + pad)
                        face_crop = img_bgr[fy1:fy2, fx1:fx2]
                        if face_crop.size > 0:
                            face_sharpness = _compute_sharpness(face_crop)

                    if valid_faces:
                        best_face = max(valid_faces, key=lambda f: float(f.det_score))
                        blink = _estimate_blink(best_face, img_bgr)
                    else:
                        blink = {
                            "blink_probability": 0.0,
                            "left_eye": "no_face",
                            "right_eye": "no_face",
                        }

                    results.append(BatchPhotoResult(
                        photo_id=photo.photo_id,
                        sharpness_score=sharpness,
                        face_sharpness_score=face_sharpness,
                        blink_probability=blink["blink_probability"],
                        left_eye_status=blink["left_eye"],
                        right_eye_status=blink["right_eye"],
                        faces_detected=len(valid_faces),
                        aesthetic_score=_compute_aesthetic_score(img_bgr, nima_session),
                        clip_embedding=clip_embeddings[j].tolist(),
                        processing_ms=int((time.monotonic() - photo_started) * 1000),
                        error=None,
                    ))

                del clip_inputs, raw_embeddings, clip_embeddings

            # Explicit release after each mini-batch so GC can reclaim before
            # the next batch's downloads start.
            for img in valid_images:
                release_image(img)
            del download_results, valid_images
            gc.collect()

    return AnalyzeBatchResponse(
        results=results,
        total_photos=len(body.photos),
        failed_photos=failed,
        processing_ms=int((time.monotonic() - started) * 1000),
    )
