import type {
  HeightExtractor,
  HeightOptions,
  HeightResult,
} from '../types';

/**
 * Real monocular-depth height extractor.
 *
 * Runs DepthAnything V2 Small (ONNX, int8-quantized) entirely in the
 * browser via `@huggingface/transformers`. The model is downloaded from
 * the Hugging Face CDN on first use (~25 MB) and cached by the browser.
 * Inference uses WebGPU when available and falls back to the WASM backend
 * otherwise.
 *
 * Output is a per-pixel depth heightmap. Within the silhouette we
 * renormalize to the object's own depth range so the displacement reads
 * the *shape* of the object, not the camera-distance offset of where the
 * artist happened to place it.
 *
 * Layered behind the existing `HeightExtractor` interface so callers
 * (`useStudioStore.loadSlotImage`) do not change.
 */

const MODEL_ID = 'onnx-community/depth-anything-v2-small';

type DepthPipeline = (image: HTMLCanvasElement | ImageBitmap) => Promise<{
  depth: { toCanvas(): HTMLCanvasElement };
  predicted_depth: {
    data: Float32Array;
    dims: number[];
  };
}>;

let pipelinePromise: Promise<DepthPipeline> | null = null;

async function loadPipeline(): Promise<DepthPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const transformers = await import('@huggingface/transformers');
      // Allow models to be fetched from the Hugging Face CDN.
      transformers.env.allowLocalModels = false;
      transformers.env.allowRemoteModels = true;
      try {
        return (await transformers.pipeline(
          'depth-estimation',
          MODEL_ID,
          { dtype: 'q8', device: 'webgpu' },
        )) as unknown as DepthPipeline;
      } catch {
        return (await transformers.pipeline(
          'depth-estimation',
          MODEL_ID,
          { dtype: 'q8' },
        )) as unknown as DepthPipeline;
      }
    })().catch((err) => {
      // Reset so a later upload can retry.
      pipelinePromise = null;
      throw err;
    });
  }
  return pipelinePromise;
}

/** Warm up the model proactively (e.g. on app load) so the first scan is fast. */
export function primeDepthModel(): Promise<DepthPipeline> {
  return loadPipeline();
}

function bitmapToCanvas(image: ImageBitmap): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(image, 0, 0);
  return canvas;
}

export class TransformersDepthExtractor implements HeightExtractor {
  async extractHeight(
    image: ImageBitmap,
    mask: HTMLCanvasElement,
    _options?: HeightOptions,
  ): Promise<HeightResult> {
    const depthPipeline = await loadPipeline();

    const sourceCanvas = bitmapToCanvas(image);
    const result = await depthPipeline(sourceCanvas);
    const depthDims = result.predicted_depth.dims;
    const depthH = depthDims[depthDims.length - 2];
    const depthW = depthDims[depthDims.length - 1];
    const depthValues = result.predicted_depth.data;

    // Sample the silhouette at the depth resolution so masking lines up.
    const maskAtDepth = document.createElement('canvas');
    maskAtDepth.width = depthW;
    maskAtDepth.height = depthH;
    const maskAtDepthCtx = maskAtDepth.getContext('2d');
    if (!maskAtDepthCtx) throw new Error('2D canvas context unavailable');
    maskAtDepthCtx.drawImage(mask, 0, 0, depthW, depthH);
    const maskPixels = maskAtDepthCtx.getImageData(0, 0, depthW, depthH).data;

    // Renormalize within the silhouette so the object's own near/far range
    // drives the heightmap contrast — not the camera-to-object offset.
    let minD = Infinity;
    let maxD = -Infinity;
    for (let i = 0; i < depthValues.length; i++) {
      if (maskPixels[i * 4 + 3] > 32) {
        const v = depthValues[i];
        if (v < minD) minD = v;
        if (v > maxD) maxD = v;
      }
    }
    if (!Number.isFinite(minD) || !Number.isFinite(maxD)) {
      // No silhouette coverage in the depth-rez sample — flat fallback.
      minD = 0;
      maxD = 1;
    }
    const range = maxD - minD || 1;

    // Build the heightmap at the model output resolution first.
    const lowResCanvas = document.createElement('canvas');
    lowResCanvas.width = depthW;
    lowResCanvas.height = depthH;
    const lowResCtx = lowResCanvas.getContext('2d');
    if (!lowResCtx) throw new Error('2D canvas context unavailable');
    const lowResImage = lowResCtx.createImageData(depthW, depthH);
    for (let i = 0; i < depthValues.length; i++) {
      const alpha = maskPixels[i * 4 + 3];
      const normalized = alpha > 0 ? (depthValues[i] - minD) / range : 0.5;
      const clamped = Math.max(0, Math.min(1, normalized));
      const v = Math.round(clamped * 255);
      const offset = i * 4;
      lowResImage.data[offset] = v;
      lowResImage.data[offset + 1] = v;
      lowResImage.data[offset + 2] = v;
      lowResImage.data[offset + 3] = alpha;
    }
    lowResCtx.putImageData(lowResImage, 0, 0);

    // Upscale to the silhouette PNG's resolution with high-quality smoothing.
    const targetW = mask.width;
    const targetH = mask.height;
    const heightCanvas = document.createElement('canvas');
    heightCanvas.width = targetW;
    heightCanvas.height = targetH;
    const heightCtx = heightCanvas.getContext('2d');
    if (!heightCtx) throw new Error('2D canvas context unavailable');
    heightCtx.imageSmoothingEnabled = true;
    heightCtx.imageSmoothingQuality = 'high';
    heightCtx.drawImage(lowResCanvas, 0, 0, targetW, targetH);

    // Carve the displacement against the original-resolution silhouette,
    // forcing background pixels back to neutral so the displacement stays
    // strictly inside the object.
    const targetData = heightCtx.getImageData(0, 0, targetW, targetH);
    const maskCtx = mask.getContext('2d');
    if (!maskCtx) throw new Error('2D canvas context unavailable');
    const fullMask = maskCtx.getImageData(0, 0, targetW, targetH).data;
    for (let i = 0; i < targetData.data.length; i += 4) {
      const a = fullMask[i + 3];
      targetData.data[i + 3] = a;
      if (a < 96) {
        targetData.data[i] = 128;
        targetData.data[i + 1] = 128;
        targetData.data[i + 2] = 128;
      }
    }
    heightCtx.putImageData(targetData, 0, 0);

    return { width: targetW, height: targetH, heightCanvas };
  }
}
