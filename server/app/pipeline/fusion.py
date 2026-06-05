"""Visual-hull fusion of 6 orthographic silhouettes.

For each voxel inside ``[-1, 1]^3`` the voxel is "inside the object" only if
every silhouette agrees. Soft (feathered) silhouette alpha is preserved by
multiplying probabilities rather than ANDing booleans, giving Marching Cubes a
smooth iso-surface to extract.

A future enhancement plugs monocular-depth maps (DepthAnything V2) into the
same loop: instead of just consulting the silhouette, push the implicit
surface inward by the depth signal. The function shape is already structured
for this — `silhouettes` is the only required input today, depth maps are
optional.
"""
from __future__ import annotations

import numpy as np
from skimage.measure import marching_cubes  # type: ignore[import-not-found]

from .cameras import FACES, FACE_UV, FaceKey

DEFAULT_RESOLUTION = 160


def _project_to_face(
    grid: np.ndarray, face: FaceKey
) -> tuple[np.ndarray, np.ndarray]:
    """Project a (D,D,D,3) world grid into face image UVs in ``[0, 1]``."""
    u_axis, v_axis, u_flip, v_flip = FACE_UV[face]
    u = (grid[..., u_axis] + 1.0) * 0.5
    v = (grid[..., v_axis] + 1.0) * 0.5
    if u_flip:
        u = 1.0 - u
    if v_flip:
        v = 1.0 - v
    return u, v


def visual_hull(
    silhouettes: dict[FaceKey, np.ndarray],
    resolution: int = DEFAULT_RESOLUTION,
) -> np.ndarray:
    """Carve a voxel grid against 6 silhouette masks.

    Args:
        silhouettes: ``{face: HxW float32 mask in [0, 1]}`` for each of the 6
            faces. Soft edges are preserved.
        resolution: voxels per axis. Higher = more detail, more memory.

    Returns:
        Occupancy field of shape ``(D, D, D)`` in ``[0, 1]``. ``grid[i, j, k]``
        corresponds to world position ``(xs[i], xs[j], xs[k])`` with
        ``xs = linspace(-1, 1, D)``.
    """
    missing = [face for face in FACES if face not in silhouettes]
    if missing:
        raise ValueError(f"missing silhouettes for faces: {missing}")

    D = resolution
    xs = np.linspace(-1.0, 1.0, D, dtype=np.float32)
    gx, gy, gz = np.meshgrid(xs, xs, xs, indexing="ij")
    grid = np.stack([gx, gy, gz], axis=-1)
    occupancy = np.ones((D, D, D), dtype=np.float32)

    for face in FACES:
        mask = silhouettes[face].astype(np.float32, copy=False)
        if mask.ndim == 3:
            # Use alpha channel if RGBA, else luminance.
            if mask.shape[2] == 4:
                mask = mask[..., 3]
            else:
                mask = mask[..., :3].mean(axis=2)
        H, W = mask.shape
        u, v = _project_to_face(grid, face)
        px = np.clip((u * (W - 1)).astype(np.int64), 0, W - 1)
        # Image rows: row 0 = top = high world V, so flip V into pixel Y.
        py = np.clip(((1.0 - v) * (H - 1)).astype(np.int64), 0, H - 1)
        sampled = mask[py, px]
        occupancy *= sampled

    return occupancy


def occupancy_to_mesh(
    occupancy: np.ndarray, iso: float = 0.5
) -> tuple[np.ndarray, np.ndarray]:
    """Extract a triangle mesh via Marching Cubes.

    Returns ``(vertices, faces)`` with vertices in world coordinates spanning
    ``[-1, 1]^3``.
    """
    D = occupancy.shape[0]
    spacing = 2.0 / (D - 1)
    # Pad with zeros so any boundary intersections become closed surfaces.
    padded = np.pad(
        occupancy, pad_width=1, mode="constant", constant_values=0.0
    )
    verts, faces, _normals, _values = marching_cubes(
        padded, level=iso, spacing=(spacing, spacing, spacing)
    )
    # Padding shifted origin by one cell on each axis; undo and shift to [-1,1].
    verts = verts - (1.0 + spacing)
    return verts.astype(np.float32), faces.astype(np.int32)
