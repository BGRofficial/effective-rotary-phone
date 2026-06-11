/**
 * CPU-side pre-blur for heightmap canvases.
 *
 * The vertex shader does mask-aware Gaussian smoothing per-frame, but very
 * noisy depth signals (luminance-fallback heightmaps on raw photos) still
 * read as spikes after that pass alone. A cheap separable Gaussian baked
 * into the heightmap PNG before upload takes most of that noise out, leaves
 * the macro shape, and is essentially free at upload time.
 *
 * The blur is mask-aware: pixels with low alpha (silhouette background) are
 * excluded from neighborhood averages, so the depth values near the object
 * boundary are not pulled toward the neutral 0.5 fill.
 */

const SMOOTH_RADIUS_FRACTION = 0.012;
const MIN_RADIUS = 2;

function gaussianKernel(radius: number): Float32Array {
  const size = radius * 2 + 1;
  const kernel = new Float32Array(size);
  const sigma = Math.max(radius / 2, 0.5);
  const twoSigma2 = 2 * sigma * sigma;
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / twoSigma2);
    kernel[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < size; i++) kernel[i] /= sum;
  return kernel;
}

export function smoothHeightmap(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const radius = Math.max(
    MIN_RADIUS,
    Math.round(Math.min(w, h) * SMOOTH_RADIUS_FRACTION),
  );
  const kernel = gaussianKernel(radius);

  const src = ctx.getImageData(0, 0, w, h);
  const intermediate = new Float32Array(w * h);
  const intermediateW = new Float32Array(w * h);
  const result = new Float32Array(w * h);
  const resultW = new Float32Array(w * h);

  // Pass 1 — horizontal mask-weighted Gaussian.
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let total = 0;
      let weight = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = x + k;
        if (sx < 0 || sx >= w) continue;
        const idx = (row + sx) * 4;
        const a = src.data[idx + 3] / 255;
        if (a <= 0) continue;
        const g = kernel[k + radius];
        const value = src.data[idx]; // R = heightmap intensity
        total += value * g * a;
        weight += g * a;
      }
      const i = row + x;
      intermediate[i] = weight > 0 ? total / weight : 128;
      // Carry the original alpha through pass 1; pass 2 reweights.
      intermediateW[i] = weight > 0 ? src.data[(row + x) * 4 + 3] / 255 : 0;
    }
  }

  // Pass 2 — vertical mask-weighted Gaussian over the horizontal result.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let total = 0;
      let weight = 0;
      for (let k = -radius; k <= radius; k++) {
        const sy = y + k;
        if (sy < 0 || sy >= h) continue;
        const i = sy * w + x;
        const a = intermediateW[i];
        if (a <= 0) continue;
        const g = kernel[k + radius];
        total += intermediate[i] * g * a;
        weight += g * a;
      }
      const j = y * w + x;
      result[j] = weight > 0 ? total / weight : 128;
      resultW[j] = weight > 0 ? 1 : 0;
    }
  }

  // Compose back into RGBA, preserving the original silhouette alpha so the
  // shader still knows what's inside the object.
  const out = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(255, Math.round(result[i])));
    const offset = i * 4;
    out.data[offset] = v;
    out.data[offset + 1] = v;
    out.data[offset + 2] = v;
    // Originally-inside pixels keep their alpha; outside pixels stay at 0.
    out.data[offset + 3] = resultW[i] > 0 ? src.data[offset + 3] : 0;
  }

  const target = document.createElement('canvas');
  target.width = w;
  target.height = h;
  const targetCtx = target.getContext('2d');
  if (!targetCtx) return canvas;
  targetCtx.putImageData(out, 0, 0);
  return target;
}
