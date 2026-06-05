import { useStudioStore } from '../../state/useStudioStore';
import { FACE_ORDER } from '../../types';

/**
 * Single floating button that ships the 6 silhouettes to the reconstruction
 * server and surfaces job progress until the mesh arrives.
 */
export function ReconstructControl() {
  const slots = useStudioStore((state) => state.slots);
  const reconstruction = useStudioStore((state) => state.reconstruction);
  const requestReconstruction = useStudioStore(
    (state) => state.requestReconstruction,
  );
  const clearReconstruction = useStudioStore(
    (state) => state.clearReconstruction,
  );

  const allReady = FACE_ORDER.every((face) => slots[face].status === 'ready');
  const isBusy =
    reconstruction.status === 'submitting' ||
    reconstruction.status === 'running';
  const hasMesh = reconstruction.status === 'done' && reconstruction.glbUrl;

  let label: string;
  let aria: string;
  if (reconstruction.status === 'submitting') {
    label = 'Uploading...';
    aria = 'Uploading silhouettes';
  } else if (reconstruction.status === 'running') {
    const pct = Math.round(reconstruction.progress * 100);
    label = `${reconstruction.stage} ${pct}%`;
    aria = `Reconstructing: ${reconstruction.stage} ${pct}%`;
  } else if (reconstruction.status === 'failed') {
    label = 'Retry';
    aria = `Reconstruct failed: ${reconstruction.error ?? 'unknown error'}`;
  } else if (hasMesh) {
    label = 'Mesh ready · Clear';
    aria = 'Clear reconstructed mesh';
  } else {
    label = 'Reconstruct';
    aria = allReady
      ? 'Reconstruct 3D mesh from 6 faces'
      : 'Upload all 6 faces to enable reconstruction';
  }

  const disabled = isBusy || (!allReady && !hasMesh);

  return (
    <button
      type="button"
      className={[
        'reconstruct-control',
        isBusy ? 'is-busy' : '',
        hasMesh ? 'is-ready' : '',
        reconstruction.status === 'failed' ? 'is-failed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled}
      aria-label={aria}
      title={reconstruction.error ?? undefined}
      onClick={() => {
        if (hasMesh) {
          clearReconstruction();
          return;
        }
        void requestReconstruction();
      }}
    >
      {label}
    </button>
  );
}
