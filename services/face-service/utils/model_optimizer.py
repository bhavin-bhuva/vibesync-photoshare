"""
Build-time script: export CLIP and NIMA to INT8-quantized ONNX models.

Run once at Docker build time:
  python utils/model_optimizer.py

CLIP: ViT-B-32 visual encoder, ~350MB → ~90MB, ~3x faster CPU inference.
NIMA: MobileNetV2 aesthetic scorer, ~17MB → ~5MB, ~2x faster CPU inference.
      Skipped if /app/models/nima_mobilenet.pth is not present.
"""

import os

import numpy as np
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic

MODELS_DIR = "/app/models"


def export_clip_to_onnx() -> None:
    import open_clip

    fp32_path = os.path.join(MODELS_DIR, "clip_visual.onnx")
    int8_path = os.path.join(MODELS_DIR, "clip_visual_int8.onnx")

    if os.path.exists(int8_path):
        print(f"CLIP already quantized at {int8_path} — skipping")
        return

    print("Loading CLIP ViT-B-32 ...")
    model, _, _ = open_clip.create_model_and_transforms("ViT-B-32", pretrained="openai")
    model.eval()

    dummy = torch.randn(1, 3, 224, 224)

    print(f"Exporting CLIP visual encoder to {fp32_path} ...")
    torch.onnx.export(
        model.visual,
        dummy,
        fp32_path,
        opset_version=14,
        input_names=["image"],
        output_names=["embedding"],
        dynamic_axes={"image": {0: "batch"}},
    )
    del model

    print(f"Quantizing CLIP to INT8 → {int8_path} ...")
    quantize_dynamic(fp32_path, int8_path, weight_type=QuantType.QInt8)
    os.remove(fp32_path)
    print(f"CLIP quantized: {int8_path}")


def export_nima_to_onnx() -> None:
    weights_path = os.path.join(MODELS_DIR, "nima_mobilenet.pth")
    if not os.path.exists(weights_path):
        print(f"NIMA weights not found at {weights_path} — skipping NIMA export")
        return

    import torchvision.models as tv_models

    fp32_path = os.path.join(MODELS_DIR, "nima.onnx")
    int8_path = os.path.join(MODELS_DIR, "nima_int8.onnx")

    if os.path.exists(int8_path):
        print(f"NIMA already quantized at {int8_path} — skipping")
        return

    print("Loading NIMA MobileNetV2 ...")
    model = tv_models.mobilenet_v2(weights=None)
    model.classifier = torch.nn.Sequential(
        torch.nn.Dropout(0.2),
        torch.nn.Linear(model.last_channel, 10),
        torch.nn.Softmax(dim=1),
    )
    state = torch.load(weights_path, map_location="cpu")
    model.load_state_dict(state)
    model.eval()

    dummy = torch.randn(1, 3, 224, 224)

    print(f"Exporting NIMA to {fp32_path} ...")
    torch.onnx.export(
        model,
        dummy,
        fp32_path,
        opset_version=14,
        input_names=["image"],
        output_names=["scores"],
        dynamic_axes={"image": {0: "batch"}},
    )
    del model

    print(f"Quantizing NIMA to INT8 → {int8_path} ...")
    quantize_dynamic(fp32_path, int8_path, weight_type=QuantType.QInt8)
    os.remove(fp32_path)
    print(f"NIMA quantized: {int8_path}")


if __name__ == "__main__":
    os.makedirs(MODELS_DIR, exist_ok=True)
    export_clip_to_onnx()
    export_nima_to_onnx()
    print("Model optimization complete.")
