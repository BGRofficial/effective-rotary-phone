"""End-to-end sanity check: feed 6 synthetic silhouettes of a unit sphere
into the visual hull → Marching Cubes pipeline and confirm the output is
roughly spherical."""
from __future__ import annotations

import numpy as np

from app.pipeline.cameras import FACES
from app.pipeline.fusion import occupancy_to_mesh, visual_hull


def _sphere_silhouette(size: int = 128, radius: float = 0.9) -> np.ndarray:
    """Filled circle covering most of the image, mimicking a unit-sphere
    projected orthographically into a face image."""
    xs = np.linspace(-1.0, 1.0, size, dtype=np.float32)
    ys = np.linspace(-1.0, 1.0, size, dtype=np.float32)
    gx, gy = np.meshgrid(xs, ys, indexing="xy")
    r2 = gx * gx + gy * gy
    return (r2 <= radius * radius).astype(np.float32)


def test_visual_hull_of_sphere_silhouettes_is_roughly_spherical():
    silhouette = _sphere_silhouette()
    silhouettes = {face: silhouette for face in FACES}

    occupancy = visual_hull(silhouettes, resolution=64)
    assert occupancy.shape == (64, 64, 64)
    assert occupancy.max() > 0.5

    verts, faces = occupancy_to_mesh(occupancy, iso=0.5)
    assert len(verts) > 200
    assert len(faces) > 100

    # Bounding sphere centered near origin. The visual hull of orthographic
    # circle silhouettes is a "cushion" (intersection of cylinders), whose
    # corners reach slightly past the inscribed sphere — accept up to ~1.15.
    centered = verts - verts.mean(axis=0, keepdims=True)
    distances = np.linalg.norm(centered, axis=1)
    assert 0.7 < distances.max() < 1.15
    assert distances.std() < 0.15  # surface should be nearly equidistant
