FROM python:3.11-slim

# System deps for OpenCV and InsightFace
RUN apt-get update && apt-get install -y \
        build-essential \
        libglib2.0-0 \
        libgl1 \
        libsm6 \
        libxext6 \
        libxrender-dev \
        libgomp1 \
        wget \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first so this layer is cached on code-only changes
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the buffalo_l model (~300 MB) at build time so container
# startup is fast.  ctx_id=-1 forces CPU — no GPU available during build.
RUN python -c "from insightface.app import FaceAnalysis; app = FaceAnalysis(name='buffalo_l', root='/app/models'); app.prepare(ctx_id=-1, det_size=(640, 640)); print('Model downloaded successfully')"

# CLIP model for burst deduplication (~350 MB, cached in HuggingFace hub dir)
RUN python -c "import open_clip; model, _, preprocess = open_clip.create_model_and_transforms('ViT-B-32', pretrained='openai'); print('CLIP model ready')"

# NIMA aesthetic model — place pretrained MobileNet weights at build time.
# Download nima_mobilenet.pth from the neural-image-assessment releases and
# ADD it to the build context before running docker-compose build:
#   ADD models/nima_mobilenet.pth /app/models/nima_mobilenet.pth
# Placeholder COPY is intentionally omitted until weights are available locally.

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
