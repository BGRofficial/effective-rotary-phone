/** 2D point as [x, y]. */
export type P2 = [number, number];

/**
 * Chain an unordered set of undirected segments into polylines by matching
 * shared endpoints. Generic over the point type — used both for 2D marching-
 * squares output and 3D plane-slice segments.
 *
 * Endpoints are matched via `keyOf`, which must quantize coordinates enough
 * to absorb floating-point noise between segments computed from shared edges.
 */
export function chainSegments<P>(
  segments: ReadonlyArray<readonly [P, P]>,
  keyOf: (p: P) => string,
): P[][] {
  interface End {
    si: number;
    pi: 0 | 1;
  }
  const ends = new Map<string, End[]>();
  segments.forEach((seg, si) => {
    ([0, 1] as const).forEach((pi) => {
      const key = keyOf(seg[pi]);
      const list = ends.get(key);
      if (list) list.push({ si, pi });
      else ends.set(key, [{ si, pi }]);
    });
  });

  const used = new Array<boolean>(segments.length).fill(false);
  const result: P[][] = [];

  const takeNext = (key: string): End | null => {
    const list = ends.get(key);
    if (!list) return null;
    for (const end of list) {
      if (!used[end.si]) return end;
    }
    return null;
  };

  for (let si = 0; si < segments.length; si++) {
    if (used[si]) continue;
    used[si] = true;
    const line: P[] = [segments[si][0], segments[si][1]];

    // Grow at the tail.
    for (;;) {
      const next = takeNext(keyOf(line[line.length - 1]));
      if (!next) break;
      used[next.si] = true;
      line.push(segments[next.si][next.pi === 0 ? 1 : 0]);
    }
    // Grow at the head.
    for (;;) {
      const next = takeNext(keyOf(line[0]));
      if (!next) break;
      used[next.si] = true;
      line.unshift(segments[next.si][next.pi === 0 ? 1 : 0]);
    }
    result.push(line);
  }
  return result;
}

/** Is the polyline closed (first and last point share a key)? */
export function isClosed<P>(line: P[], keyOf: (p: P) => string): boolean {
  return line.length > 2 && keyOf(line[0]) === keyOf(line[line.length - 1]);
}

/**
 * Douglas–Peucker simplification (iterative, stack-based).
 * Tolerance is the max perpendicular deviation in the same units as points.
 */
export function simplifyPolyline(points: P2[], tolerance: number): P2[] {
  if (points.length <= 2) return points.slice();
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const tol2 = tolerance * tolerance;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop() as [number, number];
    if (b - a < 2) continue;
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;

    let maxDist2 = -1;
    let maxIdx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      let dist2: number;
      if (len2 === 0) {
        const ex = px - ax;
        const ey = py - ay;
        dist2 = ex * ex + ey * ey;
      } else {
        const cross = (px - ax) * dy - (py - ay) * dx;
        dist2 = (cross * cross) / len2;
      }
      if (dist2 > maxDist2) {
        maxDist2 = dist2;
        maxIdx = i;
      }
    }
    if (maxDist2 > tol2 && maxIdx > 0) {
      keep[maxIdx] = true;
      stack.push([a, maxIdx], [maxIdx, b]);
    }
  }
  return points.filter((_p, i) => keep[i]);
}
