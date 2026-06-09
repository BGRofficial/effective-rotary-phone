"""Structural tests for the depth sensor pipeline.

The full model inference is exercised lazily on first call and downloads
~25 MB from Hugging Face, so it isn't run here. These tests cover the
shape of the public surface and the silhouette-aware normalization
without touching the network.
"""
from __future__ import annotations

import numpy as np

from app.pipeline import depth as depth_mod


def test_depth_to_heightmap_normalizes_globally_without_mask():
    field = np.array([[0.0, 1.0], [2.0, 3.0]], dtype=np.float32)
    out = depth_mod.depth_to_heightmap(field)
    assert out.dtype == np.uint8
    assert out.shape == field.shape
    assert out.min() == 0
    assert out.max() == 255


def test_depth_to_heightmap_renormalizes_inside_silhouette():
    field = np.array(
        [
            [10.0, 10.0, 10.0],
            [10.0, 5.0, 10.0],
            [10.0, 10.0, 10.0],
        ],
        dtype=np.float32,
    )
    mask = np.zeros_like(field)
    mask[1, 1] = 1.0  # only the center pixel is "object"

    out = depth_mod.depth_to_heightmap(field, silhouette=mask)
    # Center pixel was the sole inside-mask value — should be normalized
    # against itself (range = 0), so output is 0. Outside pixels go neutral.
    assert out[1, 1] in (0, 255)  # degenerate range, either bound is fine
    # Outside pixels must be neutral grey (≈128, allowing for uint8 floor).
    assert int(out[0, 0]) in (127, 128)
    assert int(out[2, 2]) in (127, 128)


def test_module_exposes_estimate_depth_and_warm_up():
    assert callable(depth_mod.estimate_depth)
    assert callable(depth_mod.warm_up)
