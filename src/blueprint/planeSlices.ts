import * as THREE from 'three';
import { chainSegments } from './polyline';

/**
 * Cross-sections of a triangle mesh with axis-aligned planes.
 *
 * Used to draw the warping grid: the intersection curves of the proxy with
 * X/Y/Z = const planes are exactly where the box-projection iso-lines lie on
 * the surface, so projecting them into the projector view shows how flat
 * content will bend over the object.
 */

const EPS = 1e-9;

/** Intersect a geometry with the plane `position[axis] === value`. */
export function sliceGeometry(
  geometry: THREE.BufferGeometry,
  axis: 0 | 1 | 2,
  value: number,
): THREE.Vector3[][] {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const triCount = index ? index.count / 3 : position.count / 3;

  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const segments: Array<[THREE.Vector3, THREE.Vector3]> = [];

  const vertexAt = (target: THREE.Vector3, i: number): void => {
    const vi = index ? index.getX(i) : i;
    target.fromBufferAttribute(position, vi);
  };

  const crossing = (
    p: THREE.Vector3,
    q: THREE.Vector3,
    dp: number,
    dq: number,
  ): THREE.Vector3 => {
    const t = dp / (dp - dq);
    return new THREE.Vector3().lerpVectors(p, q, t);
  };

  for (let t = 0; t < triCount; t++) {
    vertexAt(va, t * 3);
    vertexAt(vb, t * 3 + 1);
    vertexAt(vc, t * 3 + 2);

    let da = va.getComponent(axis) - value;
    let db = vb.getComponent(axis) - value;
    let dc = vc.getComponent(axis) - value;
    // Nudge exact-on-plane vertices so every triangle yields 0 or 2 crossings.
    if (Math.abs(da) < EPS) da = EPS;
    if (Math.abs(db) < EPS) db = EPS;
    if (Math.abs(dc) < EPS) dc = EPS;

    const points: THREE.Vector3[] = [];
    if (da * db < 0) points.push(crossing(va, vb, da, db));
    if (db * dc < 0) points.push(crossing(vb, vc, db, dc));
    if (dc * da < 0) points.push(crossing(vc, va, dc, da));

    if (points.length === 2 && points[0].distanceToSquared(points[1]) > 1e-12) {
      segments.push([points[0], points[1]]);
    }
  }

  return chainSegments(
    segments,
    (p) =>
      `${Math.round(p.x * 8192)}|${Math.round(p.y * 8192)}|${Math.round(p.z * 8192)}`,
  );
}

/**
 * Resample a polyline to a roughly uniform step so per-sample visibility
 * testing has enough resolution on curved sections.
 */
export function resamplePolyline(
  points: THREE.Vector3[],
  step: number,
): THREE.Vector3[] {
  if (points.length < 2) return points.slice();
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dist = a.distanceTo(b);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let k = 0; k < n; k++) {
      out.push(new THREE.Vector3().lerpVectors(a, b, k / n));
    }
  }
  out.push(points[points.length - 1].clone());
  return out;
}
