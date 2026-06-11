import { create } from 'zustand';
import type {
  FaceKey,
  FaceSlot,
  ProxyKind,
  ReconstructionState,
} from '../types';
import { FACE_ORDER } from '../types';
import { backgroundRemover } from '../masking/BackgroundRemover';
import { heightExtractor } from '../scan/HeightExtractor';
import {
  fetchJobStatus,
  fetchMeshSize,
  fetchServerHealth,
  resolveMeshUrl,
  submitReconstruction,
} from '../reconstruction/MeshReconstructor';

type ServerStatusKind = 'checking' | 'online' | 'offline';

interface ServerHealth {
  status: ServerStatusKind;
  version: string | null;
}

/** Encode a canvas as a PNG object URL. */
function canvasToObjectUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(URL.createObjectURL(blob));
      else reject(new Error('Failed to encode image'));
    }, 'image/png');
  });
}

function revokeSlotUrls(slot: FaceSlot): void {
  if (slot.sourceUrl) URL.revokeObjectURL(slot.sourceUrl);
  if (slot.maskUrl) URL.revokeObjectURL(slot.maskUrl);
  if (slot.heightUrl) URL.revokeObjectURL(slot.heightUrl);
}

const createEmptySlot = (): FaceSlot => ({
  sourceUrl: null,
  maskUrl: null,
  heightUrl: null,
  status: 'empty',
  error: null,
});

function createEmptySlots(): Record<FaceKey, FaceSlot> {
  return Object.fromEntries(
    FACE_ORDER.map((key) => [key, createEmptySlot()]),
  ) as Record<FaceKey, FaceSlot>;
}

const initialReconstruction: ReconstructionState = {
  status: 'idle',
  jobId: null,
  stage: '',
  progress: 0,
  glbUrl: null,
  triangleCount: null,
  sizeBytes: null,
  completedAt: null,
  error: null,
};

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

interface StudioState {
  slots: Record<FaceKey, FaceSlot>;
  proxyKind: ProxyKind;
  /** Overall displacement amplitude (0..1) applied to all face heightmaps. */
  reliefStrength: number;
  /**
   * Smoothness (0..1) of the per-vertex heightmap blur. Higher values
   * suppress per-pixel noise so the proxy shows macro curvature rather than
   * spikes; 0 reproduces the raw heightmap detail.
   */
  heightSmoothness: number;
  reconstruction: ReconstructionState;
  serverHealth: ServerHealth;
  /** Projector-calibration mode: the orbit view becomes the projector POV. */
  projectorMode: boolean;
  /** Virtual projector lens — vertical field of view in degrees. */
  projectorFov: number;
  /** Aspect ratio (w/h) of the selected export resolution / aspect guide. */
  projectorAspect: number;

  loadSlotImage: (face: FaceKey, file: File) => Promise<void>;
  clearSlot: (face: FaceKey) => void;
  setProxyKind: (kind: ProxyKind) => void;
  setReliefStrength: (value: number) => void;
  setHeightSmoothness: (value: number) => void;
  /** Submit the 6 silhouettes to the server and poll until a mesh is ready. */
  requestReconstruction: () => Promise<void>;
  clearReconstruction: () => void;
  /** Refresh server health into the store. */
  pollServerHealth: () => Promise<void>;
  setProjectorMode: (on: boolean) => void;
  setProjectorFov: (fov: number) => void;
  setProjectorAspect: (aspect: number) => void;
}

export const useStudioStore = create<StudioState>((set, get) => ({
  slots: createEmptySlots(),
  proxyKind: 'sphere',
  reliefStrength: 0.35,
  // Default smoothness shows macro curvature rather than per-pixel spikes.
  heightSmoothness: 0.55,
  reconstruction: { ...initialReconstruction },
  serverHealth: { status: 'checking', version: null },
  projectorMode: false,
  projectorFov: 42,
  projectorAspect: 16 / 9,

  loadSlotImage: async (face, file) => {
    revokeSlotUrls(get().slots[face]);

    const sourceUrl = URL.createObjectURL(file);
    set((state) => ({
      slots: {
        ...state.slots,
        [face]: {
          sourceUrl,
          maskUrl: null,
          heightUrl: null,
          status: 'processing',
          error: null,
        },
      },
    }));

    try {
      const bitmap = await createImageBitmap(file);
      const mask = await backgroundRemover.removeBackground(bitmap);
      const heightmap = await heightExtractor.extractHeight(
        bitmap,
        mask.maskCanvas,
      );
      bitmap.close();

      const [maskUrl, heightUrl] = await Promise.all([
        canvasToObjectUrl(mask.maskCanvas),
        canvasToObjectUrl(heightmap.heightCanvas),
      ]);

      if (get().slots[face].sourceUrl !== sourceUrl) {
        URL.revokeObjectURL(maskUrl);
        URL.revokeObjectURL(heightUrl);
        return;
      }

      set((state) => ({
        slots: {
          ...state.slots,
          [face]: {
            sourceUrl,
            maskUrl,
            heightUrl,
            status: 'ready',
            error: null,
          },
        },
      }));
    } catch (err) {
      if (get().slots[face].sourceUrl !== sourceUrl) return;
      set((state) => ({
        slots: {
          ...state.slots,
          [face]: {
            sourceUrl,
            maskUrl: null,
            heightUrl: null,
            status: 'error',
            error: err instanceof Error ? err.message : 'Scan failed',
          },
        },
      }));
    }
  },

  clearSlot: (face) => {
    revokeSlotUrls(get().slots[face]);
    set((state) => ({
      slots: { ...state.slots, [face]: createEmptySlot() },
    }));
  },

  setProxyKind: (kind) => set({ proxyKind: kind }),
  setReliefStrength: (value) =>
    set({ reliefStrength: Math.max(0, Math.min(1, value)) }),
  setHeightSmoothness: (value) =>
    set({ heightSmoothness: Math.max(0, Math.min(1, value)) }),

  requestReconstruction: async () => {
    set({
      reconstruction: {
        ...initialReconstruction,
        status: 'submitting',
      },
    });

    let jobId: string;
    try {
      jobId = await submitReconstruction(get().slots);
    } catch (err) {
      set({
        reconstruction: {
          ...initialReconstruction,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Submit failed',
        },
      });
      return;
    }

    set((state) => ({
      reconstruction: {
        ...state.reconstruction,
        status: 'running',
        jobId,
        stage: 'queued',
        progress: 0,
      },
    }));

    const startedAt = Date.now();
    while (true) {
      if (get().reconstruction.jobId !== jobId) return; // cleared mid-poll
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        set((state) => ({
          reconstruction: {
            ...state.reconstruction,
            status: 'failed',
            error: 'Reconstruction timed out',
          },
        }));
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      let job: Awaited<ReturnType<typeof fetchJobStatus>>;
      try {
        job = await fetchJobStatus(jobId);
      } catch (err) {
        set((state) => ({
          reconstruction: {
            ...state.reconstruction,
            status: 'failed',
            error: err instanceof Error ? err.message : 'Poll failed',
          },
        }));
        return;
      }

      if (job.status === 'done' && job.mesh_url) {
        const resolvedUrl = resolveMeshUrl(job.mesh_url);
        set((state) => ({
          reconstruction: {
            ...state.reconstruction,
            status: 'done',
            stage: 'done',
            progress: 1,
            glbUrl: resolvedUrl,
            triangleCount: job.triangle_count,
            completedAt: Date.now(),
            error: null,
          },
          // Auto-switch the proxy so the user sees the reconstructed mesh
          // immediately once it lands.
          proxyKind: 'mesh',
        }));
        // Lazily fetch the file size for the panel; not blocking the swap.
        void fetchMeshSize(resolvedUrl).then((size) => {
          if (get().reconstruction.glbUrl === resolvedUrl) {
            set((state) => ({
              reconstruction: { ...state.reconstruction, sizeBytes: size },
            }));
          }
        });
        return;
      }
      if (job.status === 'failed') {
        set((state) => ({
          reconstruction: {
            ...state.reconstruction,
            status: 'failed',
            error: job.error ?? 'Reconstruction failed',
          },
        }));
        return;
      }

      set((state) => ({
        reconstruction: {
          ...state.reconstruction,
          stage: job.stage,
          progress: job.progress,
        },
      }));
    }
  },

  clearReconstruction: () => {
    set({
      reconstruction: { ...initialReconstruction },
      proxyKind: get().proxyKind === 'mesh' ? 'sphere' : get().proxyKind,
    });
  },

  pollServerHealth: async () => {
    const health = await fetchServerHealth();
    set({
      serverHealth: {
        status: health.ok ? 'online' : 'offline',
        version: health.version,
      },
    });
  },

  setProjectorMode: (on) => set({ projectorMode: on }),
  setProjectorFov: (fov) =>
    set({ projectorFov: Math.max(15, Math.min(80, fov)) }),
  setProjectorAspect: (aspect) => set({ projectorAspect: aspect }),
}));
