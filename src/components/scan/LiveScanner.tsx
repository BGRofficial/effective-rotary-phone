import { useEffect, useRef, useState } from 'react';
import { useStudioStore } from '../../state/useStudioStore';
import { FACE_META, FACE_ORDER } from '../../types';
import type { FaceKey } from '../../types';
import {
  LiveScanController,
  type LiveScanFrame,
} from '../../scan/liveScanController';

interface LiveScannerProps {
  onClose: () => void;
}

/**
 * Full-screen live "relief sensor": shows the rear-camera feed with a
 * continuously-updated depth heatmap overlay, so the artist can see surface
 * curvature in real time. Tapping a face button captures the current frame
 * into that slot (which then runs the full masking + depth scan).
 */
export function LiveScanner({ onClose }: LiveScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<LiveScanController | null>(null);

  const loadSlotImage = useStudioStore((state) => state.loadSlotImage);
  const slots = useStudioStore((state) => state.slots);

  const [latency, setLatency] = useState<number | null>(null);
  const [backend, setBackend] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDepth, setShowDepth] = useState(true);
  const [capturing, setCapturing] = useState<FaceKey | null>(null);

  // `showDepth` is read inside the frame callback; keep a ref so we don't
  // need to restart the controller when it toggles.
  const showDepthRef = useRef(showDepth);
  useEffect(() => {
    showDepthRef.current = showDepth;
  }, [showDepth]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const paintOverlay = (frame: LiveScanFrame) => {
      setLatency(frame.latencyMs);
      setBackend(frame.backend);
      setError(null);
      const overlay = overlayRef.current;
      if (!overlay) return;
      const ctx = overlay.getContext('2d');
      if (!ctx) return;

      if (!showDepthRef.current) {
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        return;
      }

      const { depthCanvas } = frame;
      if (
        overlay.width !== depthCanvas.width ||
        overlay.height !== depthCanvas.height
      ) {
        overlay.width = depthCanvas.width;
        overlay.height = depthCanvas.height;
      }

      // Colorize grayscale depth into a turbo-ish heat ramp (near = warm).
      const src = depthCanvas
        .getContext('2d')!
        .getImageData(0, 0, depthCanvas.width, depthCanvas.height);
      const out = ctx.createImageData(depthCanvas.width, depthCanvas.height);
      for (let i = 0; i < src.data.length; i += 4) {
        const d = src.data[i] / 255;
        // simple warm-cool ramp
        out.data[i] = Math.round(255 * Math.min(1, d * 1.5));
        out.data[i + 1] = Math.round(255 * (1 - Math.abs(d - 0.5) * 2));
        out.data[i + 2] = Math.round(255 * Math.min(1, (1 - d) * 1.5));
        out.data[i + 3] = 150;
      }
      ctx.putImageData(out, 0, 0);
    };

    const controller = new LiveScanController({
      video,
      onFrame: paintOverlay,
      onError: setError,
    });
    controllerRef.current = controller;
    void controller.start();

    return () => {
      controller.stop();
      controllerRef.current = null;
    };
  }, []);

  const handleCapture = async (face: FaceKey) => {
    const controller = controllerRef.current;
    if (!controller) return;
    setCapturing(face);
    try {
      const file = await controller.captureStill(`${face}.png`);
      if (file) {
        await loadSlotImage(face, file);
      }
    } finally {
      setCapturing(null);
    }
  };

  return (
    <div className="live-scanner" role="dialog" aria-label="Live relief sensor">
      <div className="live-scanner__stage">
        <video ref={videoRef} className="live-scanner__video" />
        <canvas ref={overlayRef} className="live-scanner__overlay" />

        <div className="live-scanner__hud">
          <span
            className={`live-scanner__pill ${
              error ? 'is-error' : latency !== null ? 'is-live' : ''
            }`}
          >
            {error
              ? 'Sensor error'
              : latency !== null
                ? `Live · ${latency} ms${backend === 'server' ? ' · server' : backend === 'browser' ? ' · device' : ''}`
                : 'Starting…'}
          </span>
          <button
            type="button"
            className="live-scanner__pill live-scanner__toggle"
            aria-pressed={showDepth}
            onClick={() => setShowDepth((v) => !v)}
          >
            {showDepth ? 'Depth on' : 'Depth off'}
          </button>
        </div>

        {error && <div className="live-scanner__error">{error}</div>}
      </div>

      <div className="live-scanner__faces" aria-label="Capture into face">
        {FACE_ORDER.map((face) => {
          const filled = slots[face].status === 'ready';
          return (
            <button
              key={face}
              type="button"
              className={`live-scanner__face${filled ? ' is-filled' : ''}${
                capturing === face ? ' is-capturing' : ''
              }`}
              disabled={capturing !== null}
              onClick={() => void handleCapture(face)}
            >
              {FACE_META[face].label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="live-scanner__close"
        aria-label="Close live sensor"
        onClick={onClose}
      >
        Done
      </button>
    </div>
  );
}
