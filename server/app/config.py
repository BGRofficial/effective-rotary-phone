"""Environment-driven settings for the reconstruction server."""
from __future__ import annotations
import os
from pathlib import Path

VERSION = "0.1.0"

DATA_DIR = Path(os.environ.get("DATA_DIR", "/data"))
MESH_DIR = DATA_DIR / "meshes"
MESH_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://localhost:4173",
    ).split(",")
    if origin.strip()
]

# Visual-hull voxel grid resolution per axis. 160 ~ 4.1M voxels.
VOXEL_RESOLUTION = int(os.environ.get("VOXEL_RESOLUTION", "160"))

# Target triangle count after decimation.
MESH_TARGET_FACES = int(os.environ.get("MESH_TARGET_FACES", "12000"))

# Inputs larger than this longest edge are downscaled before fusion.
MAX_INPUT_DIM = int(os.environ.get("MAX_INPUT_DIM", "768"))

# How long finished jobs are retained on disk + in memory.
JOB_TTL_HOURS = int(os.environ.get("JOB_TTL_HOURS", "24"))
