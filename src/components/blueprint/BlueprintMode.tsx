import { useEffect, useRef, useState } from 'react';
import { useStudioStore } from '../../state/useStudioStore';
import { generateBlueprint } from '../../blueprint/renderBlueprint';
import {
  downloadBlob,
  downloadText,
  svgToPngBlob,
} from '../../blueprint/downloads';

interface ResolutionPreset {
  key: string;
  label: string;
  width: number;
  height: number;
}

const RESOLUTIONS: ReadonlyArray<ResolutionPreset> = [
  { key: 'fhd', label: 'FHD', width: 1920, height: 1080 },
  { key: 'uhd', label: '4K', width: 3840, height: 2160 },
  { key: 'square', label: '1:1', width: 2048, height: 2048 },
];

/**
 * Projector calibration + blueprint export (Phase 3).
 *
 * Closed: a single launcher pill. Open: the studio chrome hides, the orbit
 * view becomes the virtual projector's POV (auto-rotate paused), an aspect
 * guide shows the export crop, and the panel offers lens (FOV), grid density,
 * resolution presets and SVG/PNG export.
 */
export function BlueprintMode() {
  const projectorMode = useStudioStore((state) => state.projectorMode);
  const setProjectorMode = useStudioStore((state) => state.setProjectorMode);
  const projectorFov = useStudioStore((state) => state.projectorFov);
  const setProjectorFov = useStudioStore((state) => state.setProjectorFov);
  const setProjectorAspect = useStudioStore(
    (state) => state.setProjectorAspect,
  );

  const [resolutionKey, setResolutionKey] = useState('fhd');
  const [gridDivisions, setGridDivisions] = useState(10);
  const [busy, setBusy] = useState<'svg' | 'png' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const guideRef = useRef<HTMLDivElement>(null);

  // Keep the canvas-side auto-framing in sync with the selected guide aspect.
  useEffect(() => {
    const preset =
      RESOLUTIONS.find((r) => r.key === resolutionKey) ?? RESOLUTIONS[0];
    setProjectorAspect(preset.width / preset.height);
  }, [resolutionKey, setProjectorAspect]);

  if (!projectorMode) {
    return (
      <button
        type="button"
        className="blueprint-launcher"
        onClick={() => setProjectorMode(true)}
        aria-label="Open projector blueprint mode"
      >
        ▦ Blueprint
      </button>
    );
  }

  const resolution =
    RESOLUTIONS.find((r) => r.key === resolutionKey) ?? RESOLUTIONS[0];

  const handleExport = async (kind: 'svg' | 'png') => {
    setBusy(kind);
    setError(null);
    try {
      const guideHeight =
        guideRef.current?.getBoundingClientRect().height ?? window.innerHeight;
      const result = await generateBlueprint({
        width: resolution.width,
        height: resolution.height,
        gridDivisions,
        guideHeightRatio: guideHeight / window.innerHeight,
        fovDeg: projectorFov,
      });
      const base = `blueprint-${resolution.width}x${resolution.height}`;
      if (kind === 'svg') {
        downloadText(result.svg, `${base}.svg`, 'image/svg+xml');
      } else {
        const png = await svgToPngBlob(
          result.svg,
          result.width,
          result.height,
        );
        downloadBlob(png, `${base}.png`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  };

  const guideWidthCss = `min(92vw, ${(62 * (resolution.width / resolution.height)).toFixed(2)}vh)`;

  return (
    <>
      <div className="blueprint-title">▦ Projector view</div>

      <div className="blueprint-guide-layer" aria-hidden="true">
        <div
          ref={guideRef}
          className="blueprint-guide"
          style={{
            width: guideWidthCss,
            aspectRatio: `${resolution.width} / ${resolution.height}`,
          }}
        >
          <span className="blueprint-guide__tick blueprint-guide__tick--tl" />
          <span className="blueprint-guide__tick blueprint-guide__tick--tr" />
          <span className="blueprint-guide__tick blueprint-guide__tick--bl" />
          <span className="blueprint-guide__tick blueprint-guide__tick--br" />
        </div>
      </div>

      <section className="blueprint-panel" aria-label="Blueprint export">
        <div className="blueprint-panel__row">
          <span className="blueprint-panel__label">Lens</span>
          <input
            type="range"
            min={20}
            max={70}
            step={0.5}
            value={projectorFov}
            onChange={(event) => setProjectorFov(Number(event.target.value))}
            className="blueprint-panel__slider"
          />
          <span className="blueprint-panel__value">
            {projectorFov.toFixed(1)}°
          </span>
        </div>

        <div className="blueprint-panel__row">
          <span className="blueprint-panel__label">Grid</span>
          <input
            type="range"
            min={4}
            max={20}
            step={1}
            value={gridDivisions}
            onChange={(event) => setGridDivisions(Number(event.target.value))}
            className="blueprint-panel__slider"
          />
          <span className="blueprint-panel__value">{gridDivisions}</span>
        </div>

        <div
          className="blueprint-panel__res"
          role="radiogroup"
          aria-label="Output resolution"
        >
          {RESOLUTIONS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              role="radio"
              aria-checked={preset.key === resolutionKey}
              className={`blueprint-panel__res-option${
                preset.key === resolutionKey ? ' is-active' : ''
              }`}
              onClick={() => setResolutionKey(preset.key)}
            >
              {preset.label}
            </button>
          ))}
          <span className="blueprint-panel__res-size">
            {resolution.width}×{resolution.height}
          </span>
        </div>

        <div className="blueprint-panel__actions">
          <button
            type="button"
            className="blueprint-panel__action blueprint-panel__action--svg"
            disabled={busy !== null}
            onClick={() => void handleExport('svg')}
          >
            {busy === 'svg' ? 'Exporting…' : 'Export SVG'}
          </button>
          <button
            type="button"
            className="blueprint-panel__action blueprint-panel__action--png"
            disabled={busy !== null}
            onClick={() => void handleExport('png')}
          >
            {busy === 'png' ? 'Exporting…' : 'Export PNG'}
          </button>
          <button
            type="button"
            className="blueprint-panel__action blueprint-panel__action--done"
            onClick={() => setProjectorMode(false)}
          >
            Done
          </button>
        </div>

        {error && <div className="blueprint-panel__error">{error}</div>}
        <div className="blueprint-panel__hint">
          Aim from the physical projector's position — frame the object inside
          the guide, then export.
        </div>
      </section>
    </>
  );
}
