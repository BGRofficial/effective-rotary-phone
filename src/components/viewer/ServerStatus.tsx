import { useEffect, useState } from 'react';
import {
  RECONSTRUCTION_API_URL,
  fetchServerHealth,
} from '../../reconstruction/MeshReconstructor';

type Status = 'checking' | 'online' | 'offline';

const POLL_INTERVAL_MS = 20_000;

/**
 * Tiny pill in the corner showing whether the reconstruction server is
 * reachable. Polls `/health` periodically; degrades silently when offline so
 * the studio still works for masking + relief + sphere/cylinder proxy.
 */
export function ServerStatus() {
  const [status, setStatus] = useState<Status>('checking');
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      const health = await fetchServerHealth();
      if (cancelled) return;
      setStatus(health.ok ? 'online' : 'offline');
      setVersion(health.version);
    };
    void ping();
    const id = window.setInterval(ping, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const label =
    status === 'online'
      ? (version ? `v${version}` : 'on')
      : status === 'offline'
        ? 'off'
        : '…';

  return (
    <div
      className={`server-status server-status--${status}`}
      title={RECONSTRUCTION_API_URL}
      aria-live="polite"
    >
      <span className="server-status__dot" aria-hidden="true" />
      <span className="server-status__label">{label}</span>
    </div>
  );
}
