import type { HeightExtractor } from '../types';
import { WebGLLuminanceHeightExtractor } from './webglLuminanceHeightExtractor';

export type { HeightExtractor } from '../types';

/**
 * The active scan / relief extractor.
 *
 * Today this is the model-free luminance high-pass extractor. To upgrade to
 * physically meaningful depth (e.g. DepthAnything via onnxruntime-web),
 * implement `HeightExtractor` in a new module and swap the instance here —
 * no other code changes needed.
 */
export const heightExtractor: HeightExtractor =
  new WebGLLuminanceHeightExtractor();
