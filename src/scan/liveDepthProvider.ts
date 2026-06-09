import { estimateDepthPreview } from './transformersDepthExtractor';
import {
  RECONSTRUCTION_API_URL,
  fetchServerHealth,
} from '../reconstruction/MeshReconstructor';

/**
 * Per-frame depth for the live sensor, with backend fallback.
 *
 * Tries the in-browser DepthAnything model first (lowest latency, works on
 * the static deploy). If that can't load — e.g. the model CDN is blocked —
 * it falls back to the server's `/depth` endpoint when the reconstruction
 * server is online. The chosen backend is remembered for the session.
 */
type Backend = 'browser' | 'server' | 'none';

let backend: Backend | null = null;

async function serverDepth(
  frame: HTMLCanvasElement,
): Promise<HTMLCanvasElement> {
  const blob = await new Promise<Blob | null>((resolve) =>
    frame.toBlob((b) => resolve(b), 'image/png'),
  );
  if (!blob) throw new Error('frame encode failed');

  const formData = new FormData();
  formData.append('image', blob, 'frame.png');

  const res = await fetch(`${RECONSTRUCTION_API_URL}/depth`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`/depth ${res.status}`);
  const depthBlob = await res.blob();
  const bitmap = await createImageBitmap(depthBlob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

/** Run depth for one live frame, picking/remembering the working backend. */
export async function liveDepth(
  frame: HTMLCanvasElement,
): Promise<HTMLCanvasElement> {
  if (backend === 'browser') return estimateDepthPreview(frame);
  if (backend === 'server') return serverDepth(frame);

  // First call: probe browser, then server.
  try {
    const result = await estimateDepthPreview(frame);
    backend = 'browser';
    return result;
  } catch {
    const health = await fetchServerHealth();
    if (health.ok) {
      const result = await serverDepth(frame);
      backend = 'server';
      return result;
    }
    backend = 'none';
    throw new Error(
      'No depth backend available (browser model blocked, server offline).',
    );
  }
}

/** Which backend the live sensor settled on, for HUD display. */
export function liveDepthBackend(): Backend | null {
  return backend;
}

/** Reset the cached backend (e.g. when reopening the scanner). */
export function resetLiveDepthBackend(): void {
  backend = null;
}
