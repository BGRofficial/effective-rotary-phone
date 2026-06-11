"""Post-process the raw Marching Cubes mesh into something the client can use.

Steps: keep largest connected component, Taubin smooth (volume-preserving,
suppresses the cushiony / spiky artefacts of a raw visual hull), quadric-
decimate to a target triangle count, then recenter and rescale so the mesh
fits within ``[-0.95, 0.95]^3`` — slightly inside the box-projection bounds
used by the client's shader.
"""
from __future__ import annotations

import numpy as np
import trimesh
import trimesh.smoothing


def keep_largest_component(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    components = mesh.split(only_watertight=False)
    if len(components) <= 1:
        return mesh
    return max(components, key=lambda c: len(c.vertices))


def _taubin_smooth(
    mesh: trimesh.Trimesh,
    iterations: int = 18,
    lambda_: float = 0.6,
    mu: float = -0.62,
) -> trimesh.Trimesh:
    """Taubin λ/μ surface smoothing.

    Alternates a Laplacian shrink (``+λ``) with an inflate (``-μ``) so the
    high-frequency surface noise that gives a visual hull its "spiky" look
    is suppressed without the volume collapse that pure Laplacian causes.
    Operates in place on ``mesh.vertices`` and returns the same mesh.
    """
    vertices = np.asarray(mesh.vertices, dtype=np.float64)
    n = len(vertices)
    if n == 0:
        return mesh

    # Build a vertex neighbor list once.
    neighbors: list[list[int]] = [[] for _ in range(n)]
    seen: set[tuple[int, int]] = set()
    for a, b, c in mesh.faces:
        for u, v in ((a, b), (b, c), (c, a)):
            key = (u, v) if u < v else (v, u)
            if key in seen:
                continue
            seen.add(key)
            neighbors[u].append(int(v))
            neighbors[v].append(int(u))

    # Uniform-weight Laplacian — fast and well-conditioned for MC meshes.
    counts = np.array([max(1, len(nbrs)) for nbrs in neighbors], dtype=np.float64)
    flat = np.fromiter(
        (idx for nbrs in neighbors for idx in nbrs),
        dtype=np.int64,
        count=int(counts.sum()) if counts.sum() > 0 else 0,
    )
    offsets = np.concatenate(([0], np.cumsum(counts).astype(np.int64)))

    current = vertices.copy()
    sums = np.empty_like(current)
    for step in range(iterations * 2):
        # Aggregate neighbor sums via reduceat.
        sums[...] = 0.0
        if flat.size > 0:
            np.add.at(sums, np.repeat(np.arange(n), counts.astype(int)), current[flat])
        avg = sums / counts[:, None]
        delta = avg - current
        factor = lambda_ if (step % 2 == 0) else mu
        current = current + factor * delta

    mesh.vertices = current.astype(np.float32, copy=False)
    return mesh


def smooth_surface(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    """High-quality smoothing pipeline for visual-hull output."""
    # Initial Laplacian pass evens out per-voxel stair-stepping cheaply.
    trimesh.smoothing.filter_laplacian(mesh, iterations=4)
    # Then Taubin to remove the remaining high-frequency cushiness.
    _taubin_smooth(mesh, iterations=18, lambda_=0.6, mu=-0.62)
    return mesh


def decimate_to(mesh: trimesh.Trimesh, target_faces: int) -> trimesh.Trimesh:
    if len(mesh.faces) <= target_faces:
        return mesh
    try:
        simplified = mesh.simplify_quadric_decimation(target_faces)
    except Exception:
        return mesh
    return simplified if simplified is not None else mesh


def normalize_to_unit_cube(
    mesh: trimesh.Trimesh, fit: float = 0.95
) -> trimesh.Trimesh:
    bounds = mesh.bounds  # (2, 3)
    center = (bounds[0] + bounds[1]) * 0.5
    mesh.apply_translation(-center)
    size = float((bounds[1] - bounds[0]).max())
    if size > 0.0:
        mesh.apply_scale(2.0 * fit / size)
    return mesh


def clean(mesh: trimesh.Trimesh, target_faces: int = 12000) -> trimesh.Trimesh:
    mesh = keep_largest_component(mesh)
    mesh = smooth_surface(mesh)
    mesh = decimate_to(mesh, target_faces=target_faces)
    mesh = normalize_to_unit_cube(mesh)
    mesh.fix_normals()
    return mesh
