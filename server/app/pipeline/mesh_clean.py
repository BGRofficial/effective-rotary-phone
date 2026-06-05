"""Post-process the raw Marching Cubes mesh into something the client can use.

Steps: keep largest connected component, Laplacian smooth, quadric-decimate
to a target triangle count, then recenter and rescale so the mesh fits within
``[-0.95, 0.95]^3`` — slightly inside the box-projection bounds used by the
client's shader.
"""
from __future__ import annotations

import trimesh
import trimesh.smoothing


def keep_largest_component(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    components = mesh.split(only_watertight=False)
    if len(components) <= 1:
        return mesh
    return max(components, key=lambda c: len(c.vertices))


def smooth_laplacian(
    mesh: trimesh.Trimesh, iterations: int = 3
) -> trimesh.Trimesh:
    trimesh.smoothing.filter_laplacian(mesh, iterations=iterations)
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
    mesh = smooth_laplacian(mesh, iterations=3)
    mesh = decimate_to(mesh, target_faces=target_faces)
    mesh = normalize_to_unit_cube(mesh)
    mesh.fix_normals()
    return mesh
