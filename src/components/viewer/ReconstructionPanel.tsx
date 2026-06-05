import { useStudioStore } from '../../state/useStudioStore';
import { downloadMesh } from '../../reconstruction/MeshReconstructor';
import { FACE_ORDER } from '../../types';

const STAGES = ['queued', 'carving', 'meshing', 'cleaning', 'exporting', 'done'];

function formatBytes(n: number | null): string {
  if (n === null) return '— KB';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatCount(n: number | null): string {
  if (n === null) return '—';
  if (n < 1000) return `${n}`;
  return `${(n / 1000).toFixed(1)}k`;
}

/**
 * Server-aware reconstruction control. Stays a tight pill while idle, opens
 * into a panel during a running job (live progress + stage chips), and on
 * completion exposes the mesh stats + a download button.
 */
export function ReconstructionPanel() {
  const slots = useStudioStore((state) => state.slots);
  const reconstruction = useStudioStore((state) => state.reconstruction);
  const serverStatus = useStudioStore((state) => state.serverHealth.status);
  const requestReconstruction = useStudioStore(
    (state) => state.requestReconstruction,
  );
  const clearReconstruction = useStudioStore(
    (state) => state.clearReconstruction,
  );

  const allReady = FACE_ORDER.every((face) => slots[face].status === 'ready');
  const status = reconstruction.status;
  const running = status === 'submitting' || status === 'running';
  const done = status === 'done' && reconstruction.glbUrl !== null;
  const failed = status === 'failed';
  const serverOffline = serverStatus === 'offline';

  let inner: React.ReactNode;

  if (done) {
    const handleDownload = () => {
      if (!reconstruction.glbUrl) return;
      const filename = reconstruction.jobId
        ? `mesh-${reconstruction.jobId}.glb`
        : 'mesh.glb';
      void downloadMesh(reconstruction.glbUrl, filename);
    };
    inner = (
      <>
        <div className="recon-panel__meta">
          <span className="recon-panel__meta-label">Triangles</span>
          <span className="recon-panel__meta-value">
            {formatCount(reconstruction.triangleCount)}
          </span>
          <span className="recon-panel__meta-sep" aria-hidden="true">
            ·
          </span>
          <span className="recon-panel__meta-label">Size</span>
          <span className="recon-panel__meta-value">
            {formatBytes(reconstruction.sizeBytes)}
          </span>
        </div>
        <div className="recon-panel__actions">
          <button
            type="button"
            className="recon-panel__action"
            onClick={handleDownload}
          >
            Download .glb
          </button>
          <button
            type="button"
            className="recon-panel__action recon-panel__action--ghost"
            onClick={() => clearReconstruction()}
          >
            Clear
          </button>
        </div>
      </>
    );
  } else if (running) {
    const pct = Math.round(reconstruction.progress * 100);
    inner = (
      <>
        <div className="recon-panel__stages" role="list">
          {STAGES.map((stage) => {
            const reached =
              STAGES.indexOf(reconstruction.stage) >= STAGES.indexOf(stage);
            const current = reconstruction.stage === stage;
            return (
              <span
                key={stage}
                role="listitem"
                className={[
                  'recon-panel__stage',
                  reached ? 'is-reached' : '',
                  current ? 'is-current' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {stage}
              </span>
            );
          })}
        </div>
        <div className="recon-panel__bar" aria-hidden="true">
          <div
            className="recon-panel__bar-fill"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="recon-panel__meta">
          <span className="recon-panel__meta-value">
            {status === 'submitting' ? 'Uploading...' : `${pct}%`}
          </span>
        </div>
      </>
    );
  } else if (failed) {
    inner = (
      <>
        <div
          className="recon-panel__error"
          title={reconstruction.error ?? undefined}
        >
          {reconstruction.error ?? 'Reconstruction failed'}
        </div>
        <div className="recon-panel__actions">
          <button
            type="button"
            className="recon-panel__action"
            disabled={!allReady}
            onClick={() => void requestReconstruction()}
          >
            Retry
          </button>
          <button
            type="button"
            className="recon-panel__action recon-panel__action--ghost"
            onClick={() => clearReconstruction()}
          >
            Dismiss
          </button>
        </div>
      </>
    );
  } else if (serverOffline) {
    inner = (
      <div className="recon-panel__hint">
        Reconstruction server offline — local masking, scan and proxy modes
        still work.
      </div>
    );
  } else {
    // idle
    inner = (
      <button
        type="button"
        className="recon-panel__action recon-panel__action--primary"
        disabled={!allReady}
        title={allReady ? undefined : 'Upload all 6 faces first'}
        onClick={() => void requestReconstruction()}
      >
        Reconstruct 3D mesh
      </button>
    );
  }

  return (
    <section
      className={[
        'recon-panel',
        running ? 'is-running' : '',
        done ? 'is-done' : '',
        failed ? 'is-failed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Mesh reconstruction"
    >
      {inner}
    </section>
  );
}
