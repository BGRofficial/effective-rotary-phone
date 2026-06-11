/**
 * Core domain types shared across the studio.
 *
 * The object is treated as a box with 6 faces. Each face maps to one signed
 * world axis, which the box-projection shader uses to pick a texture.
 */

export type FaceKey = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

/** Stable iteration order: the 4 side faces, then top, then bottom. */
export const FACE_ORDER: readonly FaceKey[] = [
  'left',
  'front',
  'right',
  'back',
  'top',
  'bottom',
] as const;

export interface FaceMeta {
  key: FaceKey;
  label: string;
  /** Signed axis the face projects along, e.g. '+z' for front. */
  axis: '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
}

export const FACE_META: Record<FaceKey, FaceMeta> = {
  front: { key: 'front', label: 'Front', axis: '+z' },
  back: { key: 'back', label: 'Back', axis: '-z' },
  left: { key: 'left', label: 'Left', axis: '-x' },
  right: { key: 'right', label: 'Right', axis: '+x' },
  top: { key: 'top', label: 'Top', axis: '+y' },
  bottom: { key: 'bottom', label: 'Bottom', axis: '-y' },
};

export type SlotStatus = 'empty' | 'processing' | 'ready' | 'error';

export interface FaceSlot {
  /** Object URL of the original uploaded image, or null if empty. */
  sourceUrl: string | null;
  /** Object URL of the extracted silhouette (RGBA, transparent background). */
  maskUrl: string | null;
  /** Object URL of the extracted relief heightmap (R = height, A = mask). */
  heightUrl: string | null;
  status: SlotStatus;
  /** Human-readable error message when status is 'error'. */
  error: string | null;
}

export type ProxyKind = 'sphere' | 'cylinder' | 'mesh';

export type ReconstructionStatus =
  | 'idle'
  | 'submitting'
  | 'running'
  | 'done'
  | 'failed';

export interface ReconstructionState {
  status: ReconstructionStatus;
  jobId: string | null;
  /** Human-readable stage from the server (carving / meshing / cleaning / ...). */
  stage: string;
  /** 0..1 progress reported by the server. */
  progress: number;
  /** Final `.glb` URL once the server has produced the mesh. */
  glbUrl: string | null;
  /** Server-reported triangle count when done. */
  triangleCount: number | null;
  /** Mesh file size in bytes (HEAD-fetched after the job completes). */
  sizeBytes: number | null;
  /** Epoch ms when the mesh became available. */
  completedAt: number | null;
  error: string | null;
}

/** Result of a background-removal pass. */
export interface MaskResult {
  width: number;
  height: number;
  /** RGBA canvas: original colors kept, alpha = silhouette coverage. */
  maskCanvas: HTMLCanvasElement;
}

export interface MaskOptions {
  /**
   * Distance from the estimated background color (0..1) above which a pixel
   * is considered foreground. Lower = more aggressive removal.
   */
  threshold?: number;
  /** Soft edge width (0..1) applied around the threshold. */
  feather?: number;
}

/**
 * Pluggable background remover. The WebGL threshold implementation ships now;
 * an ONNX-based remover (RMBG-1.4 / U2-Net) can be dropped in later without
 * touching the UI or store.
 */
export interface BackgroundRemover {
  removeBackground(
    image: ImageBitmap,
    options?: MaskOptions,
  ): Promise<MaskResult>;
}

/** Result of a scan pass — a grayscale heightmap aligned to the source image. */
export interface HeightResult {
  width: number;
  height: number;
  /** R channel = height (0..1, 0.5 = neutral). A channel = silhouette coverage. */
  heightCanvas: HTMLCanvasElement;
}

export interface HeightOptions {
  /** Amplification of the local-highpass detail (typical 1..4). */
  detail?: number;
}

/**
 * Pluggable scan pass. The luminance-based implementation derives relief from
 * a single image; a future depth-estimation model (e.g. DepthAnything via
 * onnxruntime-web) can replace it under the same interface.
 */
export interface HeightExtractor {
  extractHeight(
    image: ImageBitmap,
    mask: HTMLCanvasElement,
    options?: HeightOptions,
  ): Promise<HeightResult>;
}
