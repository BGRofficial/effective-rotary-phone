import { useEffect } from 'react';
import { useStudioStore } from '../../state/useStudioStore';
import { RECONSTRUCTION_API_URL } from '../../reconstruction/MeshReconstructor';

const POLL_INTERVAL_MS = 20_000;

/**
 * Tiny pill in the corner showing whether the reconstruction server is
 * reachable. Drives a single `serverHealth` slot on the store that the
 * Reconstruction panel also reads.
 */
export function ServerStatus() {
  const health = useStudioStore((state) => state.serverHealth);
  const pollServerHealth = useStudioStore((state) => state.pollServerHealth);

  useEffect(() => {
    void pollServerHealth();
    const id = window.setInterval(() => {
      void pollServerHealth();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [pollServerHealth]);

  const label =
    health.status === 'online'
      ? health.version
        ? `v${health.version}`
        : 'on'
      : health.status === 'offline'
        ? 'off'
        : '…';

  return (
    <div
      className={`server-status server-status--${health.status}`}
      title={RECONSTRUCTION_API_URL}
      aria-live="polite"
    >
      <span className="server-status__dot" aria-hidden="true" />
      <span className="server-status__label">{label}</span>
    </div>
  );
}
