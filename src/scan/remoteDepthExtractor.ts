import type { HeightExtractor, HeightOptions, HeightResult } from '../types';
import { RECONSTRUCTION_API_URL } from '../reconstruction/MeshReconstructor';

/**
 * Asks the reconstruction server to estimate depth for one face image.
 *
 * Same `HeightExtractor` contract as the in-browser depth model, but the
 * heavy inference runs server-side (DepthAnything V2 via onnxruntime), so the
 * client only ships a ~25 KB PNG up and gets a depth PNG back. Used when the
 * reconstruction server is available — falls back to browser inference when
 * it isn't.
 */
export class RemoteDepthExtractor implements HeightExtractor {
  async extractHeight(
    image: ImageBitmap,
    mask: HTMLCanvasElement,
    _options?: HeightOptions,
  ): Promise<HeightResult> {
    const imageBlob = await bitmapToBlob(image);
    const maskBlob = await canvasToBlob(mask);

    const formData = new FormData();
    formData.append('image', imageBlob, 'face.png');
    formData.append('mask', maskBlob, 'mask.png');

    const response = await fetch(`${RECONSTRUCTION_API_URL}/depth`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `/depth failed (${response.status}): ${text || response.statusText}`,
      );
    }

    const depthBlob = await response.blob();
    const depthBitmap = await createImageBitmap(depthBlob);

    const targetW = mask.width;
    const targetH = mask.height;
    const heightCanvas = document.createElement('canvas');
    heightCanvas.width = targetW;
    heightCanvas.height = targetH;
    const ctx = heightCanvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(depthBitmap, 0, 0, targetW, targetH);
    depthBitmap.close();

    // The server already neutralizes outside the silhouette, but the
    // resampling can bleed a few pixels at the edge — re-stamp the alpha
    // from the full-resolution mask so the displacement stays inside.
    const targetData = ctx.getImageData(0, 0, targetW, targetH);
    const maskCtx = mask.getContext('2d');
    if (!maskCtx) throw new Error('2D canvas context unavailable');
    const maskData = maskCtx.getImageData(0, 0, targetW, targetH).data;
    for (let i = 0; i < targetData.data.length; i += 4) {
      const a = maskData[i + 3];
      targetData.data[i + 3] = a;
      if (a < 96) {
        targetData.data[i] = 128;
        targetData.data[i + 1] = 128;
        targetData.data[i + 2] = 128;
      }
    }
    ctx.putImageData(targetData, 0, 0);

    return { width: targetW, height: targetH, heightCanvas };
  }
}

async function bitmapToBlob(image: ImageBitmap): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(image, 0, 0);
  return canvasToBlob(canvas);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvas encode failed'));
    }, 'image/png');
  });
}
