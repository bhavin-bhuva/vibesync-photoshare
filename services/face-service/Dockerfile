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

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
