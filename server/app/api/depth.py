"""Camera-image depth sensor endpoint.

Single-image relief measurement: POST a face photo, get back a grayscale
PNG of estimated depth. Brighter = closer to the camera (i.e. surface bumps).
Optionally accepts a silhouette mask so the depth is renormalized over the
object's own near/far range rather than the whole scene.
"""
from __future__ import annotations

import io
from typing import Optional

import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image

from ..pipeline.depth import depth_to_heightmap, estimate_depth

router = APIRouter()


def _load_silhouette(upload: UploadFile) -> np.ndarray:
    raw = upload.file.read()
    img = Image.open(io.BytesIO(raw)).convert("RGBA")
    return np.asarray(img)[..., 3].astype(np.float32) / 255.0


@router.post("/depth")
async def depth_endpoint(
    image: UploadFile = File(..., description="Face photo"),
    mask: Optional[UploadFile] = File(
        None, description="Optional RGBA silhouette PNG"
    ),
) -> Response:
    """Estimate per-pixel depth for one camera image."""
    raw = await image.read()
    if not raw:
        raise HTTPException(400, "empty image upload")
    try:
        src = Image.open(io.BytesIO(raw))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"could not decode image: {exc}") from exc

    silhouette: Optional[np.ndarray] = None
    if mask is not None:
        try:
            silhouette = _load_silhouette(mask)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(400, f"could not decode mask: {exc}") from exc

    depth_field = estimate_depth(src)
    heightmap = depth_to_heightmap(depth_field, silhouette=silhouette)

    pil = Image.fromarray(heightmap, mode="L")
    pil = pil.resize(src.size, Image.Resampling.BILINEAR)

    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    return Response(
        content=buf.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )
