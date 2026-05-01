import io
import numpy as np
from PIL import Image, ImageOps


def bytes_to_rgb_array(data: bytes) -> np.ndarray:
    """Decode raw image bytes into an RGB uint8 numpy array."""
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)  # correct EXIF rotation
    img = img.convert("RGB")
    return np.array(img)


def buffer_to_rgb_array(buf: io.BytesIO) -> np.ndarray:
    """Decode an in-memory buffer into an RGB uint8 numpy array."""
    buf.seek(0)
    return bytes_to_rgb_array(buf.read())


def resize_for_detection(
    img: np.ndarray,
    max_side: int = 1920,
) -> np.ndarray:
    """
    Downscale an image so the longest side is at most max_side pixels.
    InsightFace already resizes internally, but capping very large uploads
    here reduces memory pressure before the model sees them.
    """
    h, w = img.shape[:2]
    if max(h, w) <= max_side:
        return img
    scale = max_side / max(h, w)
    new_w, new_h = int(w * scale), int(h * scale)
    pil = Image.fromarray(img).resize((new_w, new_h), Image.LANCZOS)
    return np.array(pil)


def rgb_to_bgr(img: np.ndarray) -> np.ndarray:
    """Convert RGB array to BGR (required by InsightFace / OpenCV)."""
    return img[:, :, ::-1].copy()


def crop_and_encode_face(
    img_rgb: np.ndarray,
    bbox: list[float],
    padding: int = 20,
    output_size: tuple[int, int] = (200, 200),
) -> bytes:
    """
    Crop a face region from img_rgb (H×W×3, uint8) using the InsightFace
    bbox [x1, y1, x2, y2], expand by `padding` pixels on every side,
    resize to output_size, and return JPEG bytes — never touching disk.
    """
    h, w = img_rgb.shape[:2]
    x1, y1, x2, y2 = (int(round(v)) for v in bbox)

    # Clamp with padding
    x1 = max(0, x1 - padding)
    y1 = max(0, y1 - padding)
    x2 = min(w, x2 + padding)
    y2 = min(h, y2 + padding)

    crop = img_rgb[y1:y2, x1:x2]
    pil_crop = Image.fromarray(crop).resize(output_size, Image.LANCZOS)

    buf = io.BytesIO()
    pil_crop.save(buf, format="JPEG", quality=90)
    buf.seek(0)
    return buf.read()
