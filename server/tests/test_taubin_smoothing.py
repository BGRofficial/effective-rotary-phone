"""Verifies that the Taubin pass actually suppresses high-frequency surface
noise without collapsing the macro shape — which is precisely what we need
for visual-hull output that would otherwise look spiky."""
from __future__ import annotations

import numpy as np
import trimesh

from app.pipeline.mesh_clean import _taubin_smooth, smooth_surface


def _bumpy_sphere(subdivisions: int = 4, noise: float = 0.06) -> trimesh.Trimesh:
    sphere = trimesh.creation.icosphere(subdivisions=subdivisions)
    rng = np.random.default_rng(7)
    sphere.vertices = sphere.vertices + rng.normal(
        scale=noise, size=sphere.vertices.shape
    )
    return sphere


def _vertex_neighbor_variance(mesh: trimesh.Trimesh) -> float:
    """Mean (over vertices) of the variance of neighbors' distance to origin —
    a proxy for how spiky / noisy the surface is."""
    radii = np.linalg.norm(mesh.vertices, axis=1)
    pairs: dict[int, list[int]] = {}
    for a, b, c in mesh.faces:
        for u, v in ((a, b), (b, c), (c, a)):
            pairs.setdefault(int(u), []).append(int(v))
    variances = []
    for u, nbrs in pairs.items():
        if not nbrs:
            continue
        variances.append(float(np.var(radii[nbrs])))
    return float(np.mean(variances))


def test_taubin_reduces_noise_far_more_than_it_shrinks_volume():
    bumpy = _bumpy_sphere()
    bumpy_volume = float(bumpy.volume)
    bumpy_noise = _vertex_neighbor_variance(bumpy)

    smoothed = _taubin_smooth(bumpy.copy(), iterations=18)

    smoothed_volume = float(smoothed.volume)
    smoothed_noise = _vertex_neighbor_variance(smoothed)

    # Noise should drop by at least 50% (visually smooth).
    assert smoothed_noise < bumpy_noise * 0.5
    # Volume must stay within 12% — much better than plain Laplacian, which
    # shrinks aggressively after this many iterations.
    assert abs(smoothed_volume - bumpy_volume) / bumpy_volume < 0.12


def test_smooth_surface_pipeline_lowers_noise():
    bumpy = _bumpy_sphere()
    bumpy_noise = _vertex_neighbor_variance(bumpy)

    smoothed = smooth_surface(bumpy.copy())
    smoothed_noise = _vertex_neighbor_variance(smoothed)
    assert smoothed_noise < bumpy_noise * 0.4
