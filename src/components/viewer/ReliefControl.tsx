import { useStudioStore } from '../../state/useStudioStore';

/**
 * Minimal slider that drives the global displacement amplitude derived from
 * the per-face scanned heightmaps.
 */
export function ReliefControl() {
  const reliefStrength = useStudioStore((state) => state.reliefStrength);
  const setReliefStrength = useStudioStore((state) => state.setReliefStrength);

  return (
    <div className="relief-control" aria-label="Relief intensity">
      <span className="relief-control__label">Relief</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={reliefStrength}
        onChange={(event) => setReliefStrength(Number(event.target.value))}
        className="relief-control__slider"
      />
    </div>
  );
}
