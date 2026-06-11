import * as THREE from 'three';
import { getBlueprintContext } from './blueprintBridge';
import { traceContours } from './marchingSquares';
import { isClosed, simplifyPolyline, type P2 } from './polyline';
import { resamplePolyline, sliceGeometry } from './planeSlices';

/**
 * Blueprint generator (Phase 3).
 *
 * Renders the proxy from the virtual projector's point of view and produces
 * a vector blueprint: the object's silhouette contour plus a warping grid —
 * the X/Y/Z iso-lines of object space projected into projector screen space,
 * with raster-assisted hidden-line removal. The artist overlays the result
 * in After Effects / MadMapper and warps content to the grid.
 *
 * The blueprint intentionally uses the *undisplaced* proxy surface: a mapping
 * template needs the macro form, and the contour/grid/depth passes all stay
 * mutually consistent that way.
 */

export interface BlueprintOptions {
  /** Output size in pixels (e.g. 1920x1080). */
  width: number;
  height: number;
  /** Number of grid planes per axis. */
  gridDivisions: number;
  /**
   * Height of the on-screen aspect guide divided by the canvas height.
   * The export camera's FOV is narrowed by this factor so the exported frame
   * is exactly what the guide box shows.
   */
  guideHeightRatio: number;
  /** Projector lens — vertical FOV in degrees of the on-screen view. */
  fovDeg: number;
}

export interface BlueprintResult {
  svg: string;
  width: number;
  height: number;
  stats: { contours: number; gridPaths: number };
}

/** Working resolution of the mask/depth raster passes. */
const RASTER_WIDTH = 1280;

const GRID_AXES: ReadonlyArray<{
  axis: 0 | 1 | 2;
  id: string;
  stroke: string;
  width: number;
  opacity: number;
}> = [
  { axis: 2, id: 'grid-z', stroke: '#9effa8', width: 1.0, opacity: 0.4 },
  { axis: 0, id: 'grid-x', stroke: '#6ee7ff', width: 1.2, opacity: 0.75 },
  { axis: 1, id: 'grid-y', stroke: '#ff9ef5', width: 1.2, opacity: 0.75 },
];

// CPU mirror of three.js (>= r167) unpackRGBAToDepth: RGBADepthPacking
// stores the MOST significant byte in R and the least in A, so for raw
// bytes the depth is r/256 + g/256^2 + b/256^3 + a/256^4.
const UNPACK_R = 1 / 256;
const UNPACK_G = 1 / 65536;
const UNPACK_B = 1 / 16777216;
const UNPACK_A = 1 / 4294967296;

function perspectiveDepthToViewZ(
  depth01: number,
  near: number,
  far: number,
): number {
  return (near * far) / ((far - near) * depth01 - far);
}

export async function generateBlueprint(
  options: BlueprintOptions,
): Promise<BlueprintResult> {
  const ctx = getBlueprintContext();
  if (!ctx) {
    throw new Error('Renderer is not ready yet — try again in a moment.');
  }
  const { gl, camera, mesh } = ctx;
  const { width: W, height: H, gridDivisions } = options;

  // --- Export camera: live view narrowed to the aspect-guide crop. -------
  const liveHalf = Math.tan(THREE.MathUtils.degToRad(options.fovDeg) / 2);
  const exportVFov =
    2 *
    THREE.MathUtils.radToDeg(
      Math.atan(liveHalf * Math.min(1, options.guideHeightRatio)),
    );
  const exportCam = new THREE.PerspectiveCamera(
    exportVFov,
    W / H,
    camera.near,
    camera.far,
  );
  exportCam.position.copy(camera.position);
  exportCam.quaternion.copy(camera.quaternion);
  exportCam.updateMatrixWorld(true);

  // --- Raster passes: silhouette mask + packed depth. --------------------
  const RW = RASTER_WIDTH;
  const RH = Math.max(8, Math.round((RASTER_WIDTH * H) / W));

  const scene = new THREE.Scene();
  const maskMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const depthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    // Default NormalBlending would mix the packed depth bytes with the
    // clear color and corrupt the unpacked values — write them verbatim.
    blending: THREE.NoBlending,
  });
  const clone: THREE.Mesh<THREE.BufferGeometry, THREE.Material> =
    new THREE.Mesh(mesh.geometry, maskMaterial);
  clone.matrixAutoUpdate = false;
  clone.matrix.copy(mesh.matrixWorld);
  scene.add(clone);

  const target = new THREE.WebGLRenderTarget(RW, RH);
  const prevTarget = gl.getRenderTarget();
  const prevColor = new THREE.Color();
  gl.getClearColor(prevColor);
  const prevAlpha = gl.getClearAlpha();

  const maskPixels = new Uint8Array(RW * RH * 4);
  const depthPixels = new Uint8Array(RW * RH * 4);
  try {
    gl.setRenderTarget(target);
    gl.setClearColor(0x000000, 1);
    gl.clear(true, true, false);
    gl.render(scene, exportCam);
    gl.readRenderTargetPixels(target, 0, 0, RW, RH, maskPixels);

    clone.material = depthMaterial;
    // Background must unpack to "far" so lines against empty space survive.
    gl.setClearColor(0xffffff, 1);
    gl.clear(true, true, false);
    gl.render(scene, exportCam);
    gl.readRenderTargetPixels(target, 0, 0, RW, RH, depthPixels);
  } finally {
    gl.setRenderTarget(prevTarget);
    gl.setClearColor(prevColor, prevAlpha);
    target.dispose();
    maskMaterial.dispose();
    depthMaterial.dispose();
  }

  // --- Contour: marching squares on the mask. ----------------------------
  // Raster rows come back bottom-up, so buffer y is already world-up.
  const gray = new Uint8Array(RW * RH);
  for (let i = 0; i < gray.length; i++) gray[i] = maskPixels[i * 4];

  const bufferToExport = ([x, y]: P2): P2 => [
    (x / RW) * W,
    (1 - y / RH) * H,
  ];
  const contours = traceContours(gray, RW, RH)
    .map((loop) => simplifyPolyline(loop.map(bufferToExport), 1.2))
    .filter((loop) => loop.length >= 3);

  // --- Depth lookup helpers. ---------------------------------------------
  const depthAt = (px: number, py: number): number => {
    const i = (py * RW + px) * 4;
    return (
      depthPixels[i] * UNPACK_R +
      depthPixels[i + 1] * UNPACK_G +
      depthPixels[i + 2] * UNPACK_B +
      depthPixels[i + 3] * UNPACK_A
    );
  };
  // Farthest depth in the 3x3 neighborhood — permissive at silhouette edges.
  const maxDepthAround = (px: number, py: number): number => {
    let best = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = Math.min(RW - 1, Math.max(0, px + dx));
        const y = Math.min(RH - 1, Math.max(0, py + dy));
        const d = depthAt(x, y);
        if (d > best) best = d;
      }
    }
    return best;
  };

  // --- Warping grid: plane slices, projected + hidden-line removed. ------
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox as THREE.Box3;
  const diag = box.getSize(new THREE.Vector3()).length();
  const step = Math.max(diag / 300, 1e-4);

  const viewInverse = exportCam.matrixWorldInverse;
  const near = exportCam.near;
  const far = exportCam.far;
  const world = new THREE.Vector3();
  const view = new THREE.Vector3();
  const ndc = new THREE.Vector3();

  const sampleVisible = (point: THREE.Vector3): P2 | null => {
    world.copy(point).applyMatrix4(clone.matrix);
    view.copy(world).applyMatrix4(viewInverse);
    if (view.z > -near) return null; // behind the projector
    ndc.copy(world).project(exportCam);
    if (Math.abs(ndc.x) > 1.02 || Math.abs(ndc.y) > 1.02) return null;

    const px = Math.min(RW - 1, Math.max(0, Math.floor((ndc.x * 0.5 + 0.5) * RW)));
    const py = Math.min(RH - 1, Math.max(0, Math.floor((ndc.y * 0.5 + 0.5) * RH)));
    const surfaceViewZ = perspectiveDepthToViewZ(
      maxDepthAround(px, py),
      near,
      far,
    );
    const eps = Math.max(0.02, 0.008 * Math.abs(view.z));
    if (view.z < surfaceViewZ - eps) return null; // occluded

    return [(ndc.x * 0.5 + 0.5) * W, (1 - (ndc.y * 0.5 + 0.5)) * H];
  };

  const gridGroups: Array<{ id: string; stroke: string; width: number; opacity: number; paths: P2[][] }> =
    [];
  let gridPathCount = 0;

  for (const spec of GRID_AXES) {
    const min = box.min.getComponent(spec.axis);
    const max = box.max.getComponent(spec.axis);
    const paths: P2[][] = [];

    for (let i = 1; i <= gridDivisions; i++) {
      const value = min + ((max - min) * i) / (gridDivisions + 1);
      for (let line of sliceGeometry(geometry, spec.axis, value)) {
        const closed = isClosed(
          line,
          (p) =>
            `${Math.round(p.x * 8192)}|${Math.round(p.y * 8192)}|${Math.round(p.z * 8192)}`,
        );
        line = resamplePolyline(line, step);

        const projected = line.map(sampleVisible);
        // Bridge single-sample dropouts so curves don't turn into dashes.
        for (let k = 1; k < projected.length - 1; k++) {
          if (!projected[k] && projected[k - 1] && projected[k + 1]) {
            const a = projected[k - 1] as P2;
            const b = projected[k + 1] as P2;
            projected[k] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          }
        }

        // For closed loops, rotate the start to a hidden sample so a single
        // visible run isn't split across the array seam.
        let samples = projected;
        if (closed && projected.some((p) => p === null)) {
          const start = projected.findIndex((p) => p === null);
          samples = projected.slice(start).concat(projected.slice(0, start));
        }

        let run: P2[] = [];
        const flush = () => {
          if (run.length >= 2) {
            paths.push(simplifyPolyline(run, 0.9));
            gridPathCount++;
          }
          run = [];
        };
        for (const p of samples) {
          if (p) run.push(p);
          else flush();
        }
        flush();
      }
    }
    gridGroups.push({ ...spec, paths });
  }

  // --- Compose the SVG document. -----------------------------------------
  const svg = composeSvg({
    width: W,
    height: H,
    contours,
    gridGroups,
    meta: `BLUEPRINT ${W}x${H} / LENS ${options.fovDeg.toFixed(1)}° / GRID ${gridDivisions} / ${new Date().toISOString().slice(0, 10)}`,
  });

  return {
    svg,
    width: W,
    height: H,
    stats: { contours: contours.length, gridPaths: gridPathCount },
  };
}

interface SvgInput {
  width: number;
  height: number;
  contours: P2[][];
  gridGroups: Array<{
    id: string;
    stroke: string;
    width: number;
    opacity: number;
    paths: P2[][];
  }>;
  meta: string;
}

function pathData(points: P2[], close: boolean): string {
  const parts = points.map(
    ([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`,
  );
  return parts.join('') + (close ? 'Z' : '');
}

function composeSvg(input: SvgInput): string {
  const { width: W, height: H } = input;
  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
  );
  lines.push(`<rect width="${W}" height="${H}" fill="#000000"/>`);

  for (const group of input.gridGroups) {
    if (group.paths.length === 0) continue;
    lines.push(
      `<g id="${group.id}" fill="none" stroke="${group.stroke}" stroke-width="${group.width}" stroke-opacity="${group.opacity}" stroke-linecap="round">`,
    );
    for (const path of group.paths) {
      lines.push(`<path d="${pathData(path, false)}"/>`);
    }
    lines.push('</g>');
  }

  lines.push(
    '<g id="contour" fill="none" stroke="#ffffff" stroke-width="3" stroke-linejoin="round">',
  );
  for (const loop of input.contours) {
    lines.push(`<path d="${pathData(loop, true)}"/>`);
  }
  lines.push('</g>');

  // Frame, center crosshair and corner ticks for projector alignment.
  const cx = W / 2;
  const cy = H / 2;
  const arm = Math.round(Math.min(W, H) * 0.02);
  const tick = Math.round(Math.min(W, H) * 0.03);
  lines.push('<g id="frame" stroke="#3a3a3a" fill="none" stroke-width="1.5">');
  lines.push(`<rect x="0.75" y="0.75" width="${W - 1.5}" height="${H - 1.5}"/>`);
  lines.push(
    `<path d="M${cx - arm} ${cy}H${cx + arm}M${cx} ${cy - arm}V${cy + arm}" stroke="#555555"/>`,
  );
  for (const [tx, ty, dx, dy] of [
    [0, 0, 1, 1],
    [W, 0, -1, 1],
    [0, H, 1, -1],
    [W, H, -1, -1],
  ] as Array<[number, number, number, number]>) {
    lines.push(
      `<path d="M${tx + dx * tick} ${ty}L${tx} ${ty}L${tx} ${ty + dy * tick}" stroke="#666666"/>`,
    );
  }
  lines.push('</g>');

  lines.push(
    `<text id="meta" x="14" y="${H - 12}" fill="#8a8a8a" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="${Math.max(11, Math.round(H / 80))}">${input.meta}</text>`,
  );
  lines.push('</svg>');
  return lines.join('\n');
}
