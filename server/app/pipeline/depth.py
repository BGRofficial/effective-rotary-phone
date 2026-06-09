"""Monocular depth estimation via DepthAnything V2 Small (ONNX).

This module hosts the server-side "depth sensor": single camera image in,
per-pixel relative depth out. The model is fetched from the Hugging Face
hub on first use (~25 MB, int8-quantized) and cached on disk under
`/root/.cache/huggingface` by default — pre-baked into the Docker image so
the container is offline-capable after build.

A future enhancement plugs these depth maps into the visual-hull fusion in
`pipeline/fusion.py` to produce concavity-aware meshes.
"""
from __future__ import annotations

import threading
from typing import Optional

import numpy as np
import onnxruntime as ort
from huggingface_hub import hf_hub_download
from PIL import Image

MODEL_REPO = "onnx-community/depth-anything-v2-small"
MODEL_FILE = "onnx/model_quantized.onnx"

MODEL_INPUT_SIZE = 518
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

_session_lock = threading.Lock()
_session: Optional[ort.InferenceSession] = None


def _build_session() -> ort.InferenceSession:
    model_path = hf_hub_download(repo_id=MODEL_REPO, filename=MODEL_FILE)
    return ort.InferenceSession(
        model_path,
        providers=["CPUExecutionProvider"],
    )


def get_session() -> ort.InferenceSession:
    """Load (and cache) the ONNX inference session."""
    global _session
    if _session is None:
        with _session_lock:
            if _session is None:
                _session = _build_session()
    return _session


def warm_up() -> None:
    """Pre-load the session so the first request doesn't pay the load cost."""
    get_session()


def estimate_depth(image: Image.Image) -> np.ndarray:
    """Run DepthAnything V2 on a single RGB image.

    Returns a (H, W) float32 array of raw inverse depths (larger = closer)
    at the model's output resolution (typically 518x518).
    """
    session = get_session()

    rgb = image.convert("RGB").resize(
        (MODEL_INPUT_SIZE, MODEL_INPUT_SIZE), Image.Resampling.BILINEAR
    )
    arr = np.asarray(rgb, dtype=np.float32) / 255.0
    arr = (arr - IMAGENET_MEAN) / IMAGENET_STD
    arr = arr.transpose(2, 0, 1)[None, ...].astype(np.float32)  # NCHW

    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name
    raw = session.run([output_name], {input_name: arr})[0]

    if raw.ndim == 4:
        depth = raw[0, 0]
    elif raw.ndim == 3:
        depth = raw[0]
    else:
        depth = raw
    return depth.astype(np.float32, copy=False)


def depth_to_heightmap(
    depth: np.ndarray,
    silhouette: Optional[np.ndarray] = None,
) -> np.ndarray:
    """Normalize a raw depth map to a uint8 heightmap in [0, 255].

    If a silhouette mask is provided (float [0, 1] of any size; will be resized
    to match the depth map), normalization is performed only over masked
    pixels so the object's own near/far range — not the camera offset to a
    distant background — drives the contrast.
    """
    if silhouette is not None:
        mask = silhouette
        if mask.shape != depth.shape:
            mask_img = Image.fromarray(
                (np.clip(mask, 0.0, 1.0) * 255).astype(np.uint8), mode="L"
            )
            mask_img = mask_img.resize(
                (depth.shape[1], depth.shape[0]), Image.Resampling.BILINEAR
            )
            mask = np.asarray(mask_img, dtype=np.float32) / 255.0
        inside = mask > 0.125
    else:
        inside = np.ones_like(depth, dtype=bool)

    if inside.any():
        mn = float(depth[inside].min())
        mx = float(depth[inside].max())
    else:
        mn = float(depth.min())
        mx = float(depth.max())
    rng = mx - mn or 1.0

    normalized = np.clip((depth - mn) / rng, 0.0, 1.0)
    if silhouette is not None:
        # Neutral 0.5 where the object isn't, so external regions don't pull
        # the proxy surface around when this is used as a displacement map.
        normalized = np.where(inside, normalized, 0.5)

    return (normalized * 255.0).astype(np.uint8)
