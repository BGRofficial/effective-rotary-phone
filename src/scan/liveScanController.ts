import {
  liveDepth,
  liveDepthBackend,
  resetLiveDepthBackend,
} from './liveDepthProvider';

export interface LiveScanFrame {
  /** Grayscale depth canvas at model resolution. */
  depthCanvas: HTMLCanvasElement;
  /** Milliseconds the last inference took. */
  latencyMs: number;
  /** Which depth backend produced this frame. */
  backend: 'browser' | 'server' | 'none' | null;
}

export interface LiveScanOptions {
  video: HTMLVideoElement;
  onFrame: (frame: LiveScanFrame) => void;
  onError: (message: string) => void;
  /** Downscale longest edge fed to the model — smaller = faster. */
  sampleSize?: number;
}

/**
 * Drives a live "relief sensor": pulls frames from a running <video>, runs
 * monocular depth on each, and emits depth canvases continuously.
 *
 * Inference is sequential — the next frame is only sampled once the previous
 * depth result returns — so a slow backend (WASM) self-throttles instead of
 * piling up work. On WebGPU this runs at several frames per second.
 */
export class LiveScanController {
  private readonly video: HTMLVideoElement;
  private readonly onFrame: (frame: LiveScanFrame) => void;
  private readonly onError: (message: string) => void;
  private readonly sampleSize: number;
  private readonly sampleCanvas: HTMLCanvasElement;

  private stream: MediaStream | null = null;
  private running = false;

  constructor(options: LiveScanOptions) {
    this.video = options.video;
    this.onFrame = options.onFrame;
    this.onError = options.onError;
    this.sampleSize = options.sampleSize ?? 384;
    this.sampleCanvas = document.createElement('canvas');
  }

  async start(): Promise<void> {
    if (this.running) return;
    resetLiveDepthBackend();
    if (!navigator.mediaDevices?.getUserMedia) {
      this.onError('Camera API not available in this browser.');
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
    } catch (err) {
      this.onError(
        err instanceof Error
          ? `Camera access denied: ${err.message}`
          : 'Camera access denied.',
      );
      return;
    }

    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    try {
      await this.video.play();
    } catch {
      // Autoplay can reject silently; the loop tolerates not-yet-ready video.
    }

    this.running = true;
    void this.loop();
  }

  private sampleFrame(): HTMLCanvasElement | null {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (vw === 0 || vh === 0) return null;

    const scale = Math.min(1, this.sampleSize / Math.max(vw, vh));
    const w = Math.max(1, Math.round(vw * scale));
    const h = Math.max(1, Math.round(vh * scale));
    this.sampleCanvas.width = w;
    this.sampleCanvas.height = h;
    const ctx = this.sampleCanvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(this.video, 0, 0, w, h);
    return this.sampleCanvas;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      const frame = this.sampleFrame();
      if (!frame) {
        await new Promise((r) => setTimeout(r, 120));
        continue;
      }
      const started = performance.now();
      try {
        const depthCanvas = await liveDepth(frame);
        if (!this.running) break;
        this.onFrame({
          depthCanvas,
          latencyMs: Math.round(performance.now() - started),
          backend: liveDepthBackend(),
        });
      } catch (err) {
        if (!this.running) break;
        this.onError(
          err instanceof Error
            ? `Depth model error: ${err.message}`
            : 'Depth model error.',
        );
        // Back off a beat before retrying so we don't spin on a hard failure.
        await new Promise((r) => setTimeout(r, 800));
      }
      // Yield so the UI can paint between frames.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
  }

  /** Grab the current full-resolution video frame as a PNG File. */
  async captureStill(filename: string): Promise<File | null> {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (vw === 0 || vh === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(this.video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    );
    if (!blob) return null;
    return new File([blob], filename, { type: 'image/png' });
  }

  stop(): void {
    this.running = false;
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    if (this.video.srcObject) {
      this.video.srcObject = null;
    }
  }
}
