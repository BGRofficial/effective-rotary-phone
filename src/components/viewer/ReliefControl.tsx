import { useStudioStore } from '../../state/useStudioStore';

/**
 * Two tiny sliders that govern how the per-face heightmaps land on the proxy:
 *
 * - **Relief** — overall displacement amplitude.
 * - **Smooth** — radius of the in-shader Gaussian over the heightmap. Higher
 *   values trade per-pixel detail for clean macro curvature so the proxy
 *   reads as the *shape* of the photographed object rather than per-vertex
 *   noise spikes.
 */
export function ReliefControl() {
  const reliefStrength = useStudioStore((state) => state.reliefStrength);
  const setReliefStrength = useStudioStore((state) => state.setReliefStrength);
  const heightSmoothness = useStudioStore((state) => state.heightSmoothness);
  const setHeightSmoothness = useStudioStore(
    (state) => state.setHeightSmoothness,
  );

  return (
    <div className="relief-control" aria-label="Relief amplitude and smoothness">
      <span className="relief-control__label">Relief</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={reliefStrength}
        onChange={(event) => setReliefStrength(Number(event.target.value))}
        className="relief-control__slider"
        aria-label="Relief amplitude"
      />
      <span className="relief-control__sep" aria-hidden="true">
        ·
      </span>
      <span className="relief-control__label">Smooth</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={heightSmoothness}
        onChange={(event) => setHeightSmoothness(Number(event.target.value))}
        className="relief-control__slider"
        aria-label="Relief smoothness"
      />
    </div>
  );
}
