import { create } from 'zustand';
import type { FaceKey, FaceSlot, ProxyKind } from '../types';
import { FACE_ORDER } from '../types';
import { backgroundRemover } from '../masking/BackgroundRemover';

/** Encode a canvas as a PNG object URL. */
function canvasToObjectUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(URL.createObjectURL(blob));
      else reject(new Error('Failed to encode mask image'));
    }, 'image/png');
  });
}

function revokeSlotUrls(slot: FaceSlot): void {
  if (slot.sourceUrl) URL.revokeObjectURL(slot.sourceUrl);
  if (slot.maskUrl) URL.revokeObjectURL(slot.maskUrl);
}

const createEmptySlot = (): FaceSlot => ({
  sourceUrl: null,
  maskUrl: null,
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

  /** Upload an image into a face slot and run silhouette extraction. */
  loadSlotImage: (face: FaceKey, file: File) => Promise<void>;
  /** Empty a face slot and release its object URLs. */
  clearSlot: (face: FaceKey) => void;
  setProxyKind: (kind: ProxyKind) => void;
}

export const useStudioStore = create<StudioState>((set, get) => ({
  slots: createEmptySlots(),
  proxyKind: 'sphere',

  loadSlotImage: async (face, file) => {
    revokeSlotUrls(get().slots[face]);

    const sourceUrl = URL.createObjectURL(file);
    set((state) => ({
      slots: {
        ...state.slots,
        [face]: { sourceUrl, maskUrl: null, status: 'processing', error: null },
      },
    }));

    try {
      const bitmap = await createImageBitmap(file);
      const result = await backgroundRemover.removeBackground(bitmap);
      bitmap.close();
      const maskUrl = await canvasToObjectUrl(result.maskCanvas);

      // Guard against a newer upload having replaced this slot mid-process.
      if (get().slots[face].sourceUrl !== sourceUrl) {
        URL.revokeObjectURL(maskUrl);
        return;
      }

      set((state) => ({
        slots: {
          ...state.slots,
          [face]: { sourceUrl, maskUrl, status: 'ready', error: null },
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
            status: 'error',
            error: err instanceof Error ? err.message : 'Mask extraction failed',
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
}));
