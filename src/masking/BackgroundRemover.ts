import type { BackgroundRemover } from '../types';
import { WebGLThresholdRemover } from './webglThresholdRemover';

export type { BackgroundRemover } from '../types';

/**
 * The active background remover for the app.
 *
 * Today this is the model-free WebGL threshold remover. To upgrade quality
 * (e.g. RMBG-1.4 / U2-Net via onnxruntime-web), implement `BackgroundRemover`
 * in a new module and swap the instance here — no other code changes needed.
 */
export const backgroundRemover: BackgroundRemover = new WebGLThresholdRemover();
