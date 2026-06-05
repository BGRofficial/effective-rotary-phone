"""FastAPI application entrypoint.

Run locally:
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

Run in Docker:
    docker compose up --build
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api.reconstruct import router as reconstruct_router
from .config import ALLOWED_ORIGINS, MESH_DIR, VERSION

app = FastAPI(
    title="Projection Mapping Reconstruction",
    version=VERSION,
    description=(
        "Reconstructs a 3D triangle mesh (.glb) from the 6 face silhouettes "
        "captured by the Projection Mapping Studio client."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Generated meshes are served as static .glb files.
app.mount(
    "/static/meshes",
    StaticFiles(directory=str(MESH_DIR)),
    name="meshes",
)

app.include_router(reconstruct_router)
