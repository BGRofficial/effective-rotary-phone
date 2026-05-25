import { create } from 'zustand';
import type { FaceKey, FaceSlot, ProxyKind } from '../types';
import { FACE_ORDER } from '../types';
import { backgroundRemover } from '../masking/BackgroundRemover';
import { heightExtractor } from '../scan/HeightExtractor';

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

interface StudioState {
  slots: Record<FaceKey, FaceSlot>;
  proxyKind: ProxyKind;
  /** Overall displacement amplitude (0..1) applied to all face heightmaps. */
  reliefStrength: number;

  /**
   * Upload an image into a face slot and run the masking + scan passes.
   * The slot reaches 'ready' once both the silhouette and the heightmap are
   * available.
   */
  loadSlotImage: (face: FaceKey, file: File) => Promise<void>;
  clearSlot: (face: FaceKey) => void;
  setProxyKind: (kind: ProxyKind) => void;
  setReliefStrength: (value: number) => void;
}

export const useStudioStore = create<StudioState>((set, get) => ({
  slots: createEmptySlots(),
  proxyKind: 'sphere',
  reliefStrength: 0.35,

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

      // Guard against a newer upload having replaced this slot mid-process.
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
}));
