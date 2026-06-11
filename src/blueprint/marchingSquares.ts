import { chainSegments, type P2 } from './polyline';

/**
 * Marching squares: trace the iso-contours of a binary mask.
 *
 * `mask` is a row-major single-channel buffer of `width * height` values;
 * pixels above `threshold` count as inside. Returns one polyline per
 * contour (outer silhouettes and holes alike) in pixel coordinates, with
 * edge crossings placed at cell midpoints.
 */

// Edge midpoints of cell (x, y): Top, Right, Bottom, Left.
type EdgeId = 0 | 1 | 2 | 3;

const CASE_SEGMENTS: ReadonlyArray<ReadonlyArray<readonly [EdgeId, EdgeId]>> = [
  /* 0  */ [],
  /* 1  */ [[3, 2]],
  /* 2  */ [[2, 1]],
  /* 3  */ [[3, 1]],
  /* 4  */ [[0, 1]],
  /* 5  */ [[3, 0], [2, 1]],
  /* 6  */ [[0, 2]],
  /* 7  */ [[3, 0]],
  /* 8  */ [[3, 0]],
  /* 9  */ [[0, 2]],
  /* 10 */ [[0, 1], [3, 2]],
  /* 11 */ [[0, 1]],
  /* 12 */ [[3, 1]],
  /* 13 */ [[2, 1]],
  /* 14 */ [[3, 2]],
  /* 15 */ [],
];

function edgePoint(x: number, y: number, edge: EdgeId): P2 {
  switch (edge) {
    case 0:
      return [x + 0.5, y];
    case 1:
      return [x + 1, y + 0.5];
    case 2:
      return [x + 0.5, y + 1];
    case 3:
      return [x, y + 0.5];
  }
}

export function traceContours(
  mask: Uint8Array,
  width: number,
  height: number,
  threshold = 127,
): P2[][] {
  const inside = (x: number, y: number): 0 | 1 => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    return mask[y * width + x] > threshold ? 1 : 0;
  };

  const segments: Array<[P2, P2]> = [];
  // Scan one cell beyond the image so contours touching the border close.
  for (let y = -1; y < height; y++) {
    for (let x = -1; x < width; x++) {
      const caseIndex =
        inside(x, y) * 8 +
        inside(x + 1, y) * 4 +
        inside(x + 1, y + 1) * 2 +
        inside(x, y + 1) * 1;
      const segs = CASE_SEGMENTS[caseIndex];
      for (const [e0, e1] of segs) {
        segments.push([edgePoint(x, y, e0), edgePoint(x, y, e1)]);
      }
    }
  }

  // Edge midpoints land on half-integers — double for exact integer keys.
  return chainSegments(segments, (p) => `${p[0] * 2}|${p[1] * 2}`);
}
