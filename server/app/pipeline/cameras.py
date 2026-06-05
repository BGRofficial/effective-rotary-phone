"""Orthographic camera poses derived from face axes.

Each of the 6 face cameras looks along a signed world axis toward the origin.
Its image plane spans the two non-axis dimensions of the unit cube
``[-1, 1]^3``. The UV conventions here must stay in sync with the client's
box-projection shader (``src/shaders/boxProjection.frag.glsl``) so that
silhouettes carved on the server land in the same parametric place as the
textures painted on the client.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

FaceKey = Literal["front", "back", "left", "right", "top", "bottom"]

FACES: tuple[FaceKey, ...] = (
    "front",
    "back",
    "left",
    "right",
    "top",
    "bottom",
)

# (axis_index, sign) for each face. axis_index: 0=X, 1=Y, 2=Z.
# `sign` is the direction the camera FACES along the axis (+1 = camera on
# positive side looking toward origin).
FACE_AXIS: dict[FaceKey, tuple[int, int]] = {
    "right": (0, +1),
    "left": (0, -1),
    "top": (1, +1),
    "bottom": (1, -1),
    "front": (2, +1),
    "back": (2, -1),
}

# Per-face UV mapping: (u_axis, v_axis, u_flip, v_flip).
# - u_axis / v_axis are world-space axis indices used for image U/V.
# - u_flip / v_flip mirror the axis to keep adjacent faces seam-aligned.
# Mirrors here match the shader's negative-face handling.
FACE_UV: dict[FaceKey, tuple[int, int, bool, bool]] = {
    "right": (2, 1, False, False),
    "left": (2, 1, True, False),
    "top": (0, 2, False, False),
    "bottom": (0, 2, False, True),
    "front": (0, 1, False, False),
    "back": (0, 1, True, False),
}


@dataclass(frozen=True)
class OrthoCamera:
    face: FaceKey
    axis: int
    sign: int
    u_axis: int
    v_axis: int
    u_flip: bool
    v_flip: bool


def camera_for(face: FaceKey) -> OrthoCamera:
    axis, sign = FACE_AXIS[face]
    u_axis, v_axis, u_flip, v_flip = FACE_UV[face]
    return OrthoCamera(
        face=face,
        axis=axis,
        sign=sign,
        u_axis=u_axis,
        v_axis=v_axis,
        u_flip=u_flip,
        v_flip=v_flip,
    )
