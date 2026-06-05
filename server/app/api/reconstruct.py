"""Reconstruction HTTP endpoints."""
from __future__ import annotations

import io
import traceback
from typing import cast

import numpy as np
import trimesh
from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from PIL import Image

from ..config import (
    MAX_INPUT_DIM,
    MESH_DIR,
    MESH_TARGET_FACES,
    VERSION,
    VOXEL_RESOLUTION,
)
from ..jobs import JobStatus, job_store
from ..pipeline import mesh_clean
from ..pipeline.cameras import FACES, FaceKey
from ..pipeline.fusion import occupancy_to_mesh, visual_hull

router = APIRouter()


def _load_silhouette(upload: UploadFile) -> np.ndarray:
    raw = upload.file.read()
    if not raw:
        raise HTTPException(
            status_code=400, detail=f"empty upload for {upload.filename!r}"
        )
    try:
        img = Image.open(io.BytesIO(raw)).convert("RGBA")
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"could not decode {upload.filename!r}: {exc}",
        ) from exc

    # Downscale to bound work; preserve aspect ratio.
    img.thumbnail((MAX_INPUT_DIM, MAX_INPUT_DIM), Image.Resampling.BILINEAR)
    arr = np.array(img)

    alpha = arr[..., 3].astype(np.float32) / 255.0
    if float(alpha.std()) > 0.02:
        # Trust the client-side silhouette PNG's alpha channel.
        return alpha

    # Fallback: derive a coarse foreground mask from luminance — useful when
    # the client sends an opaque source image instead of a masked PNG.
    rgb = arr[..., :3].astype(np.float32) / 255.0
    luma = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    bg = float(np.mean([luma[0, 0], luma[0, -1], luma[-1, 0], luma[-1, -1]]))
    return (np.abs(luma - bg) > 0.18).astype(np.float32)


@router.post("/reconstruct")
async def reconstruct(
    background_tasks: BackgroundTasks,
    front: UploadFile = File(...),
    back: UploadFile = File(...),
    left: UploadFile = File(...),
    right: UploadFile = File(...),
    top: UploadFile = File(...),
    bottom: UploadFile = File(...),
) -> dict[str, str]:
    uploads = {
        "front": front,
        "back": back,
        "left": left,
        "right": right,
        "top": top,
        "bottom": bottom,
    }
    silhouettes: dict[FaceKey, np.ndarray] = {
        cast(FaceKey, face): _load_silhouette(uploads[face]) for face in FACES
    }

    job = job_store.create()
    background_tasks.add_task(_run_pipeline, job.job_id, silhouettes)
    return {"job_id": job.job_id}


def _run_pipeline(
    job_id: str, silhouettes: dict[FaceKey, np.ndarray]
) -> None:
    try:
        job_store.update(
            job_id, status=JobStatus.RUNNING, stage="carving", progress=0.1
        )
        occupancy = visual_hull(silhouettes, resolution=VOXEL_RESOLUTION)

        job_store.update(job_id, stage="meshing", progress=0.5)
        verts, faces = occupancy_to_mesh(occupancy, iso=0.5)
        if len(verts) == 0 or len(faces) == 0:
            raise RuntimeError(
                "Empty reconstruction — the 6 silhouettes do not intersect."
            )

        mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=False)

        job_store.update(job_id, stage="cleaning", progress=0.75)
        mesh = mesh_clean.clean(mesh, target_faces=MESH_TARGET_FACES)

        job_store.update(job_id, stage="exporting", progress=0.92)
        output_path = MESH_DIR / f"{job_id}.glb"
        mesh.export(str(output_path), file_type="glb")

        job_store.update(
            job_id,
            status=JobStatus.DONE,
            stage="done",
            progress=1.0,
            mesh_url=f"/static/meshes/{job_id}.glb",
            triangle_count=int(len(mesh.faces)),
        )
    except Exception as exc:  # noqa: BLE001
        traceback.print_exc()
        job_store.update(
            job_id,
            status=JobStatus.FAILED,
            stage="failed",
            error=str(exc),
        )


@router.get("/jobs/{job_id}")
async def get_job(job_id: str) -> dict[str, object]:
    job = job_store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return {
        "job_id": job.job_id,
        "status": job.status.value,
        "stage": job.stage,
        "progress": job.progress,
        "mesh_url": job.mesh_url,
        "triangle_count": job.triangle_count,
        "error": job.error,
    }


@router.get("/health")
async def health() -> dict[str, object]:
    return {"ok": True, "version": VERSION}
