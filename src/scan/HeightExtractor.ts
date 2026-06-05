import type { HeightExtractor, HeightOptions, HeightResult } from '../types';
import { TransformersDepthExtractor } from './transformersDepthExtractor';
import { WebGLLuminanceHeightExtractor } from './webglLuminanceHeightExtractor';

export type { HeightExtractor } from '../types';

/**
 * Composite extractor: tries real monocular depth (DepthAnything V2 via
 * `@huggingface/transformers`) first and falls back to the model-free WebGL
 * luminance high-pass when the model can't be loaded — e.g. when the user is
 * offline or the Hugging Face CDN is blocked. Either way the consumer
 * (`useStudioStore.loadSlotImage`) sees the same `HeightExtractor` contract.
 */
class DepthOrLuminanceExtractor implements HeightExtractor {
  private readonly primary = new TransformersDepthExtractor();
  private readonly fallback = new WebGLLuminanceHeightExtractor();
  private primaryDisabled = false;

  async extractHeight(
    image: ImageBitmap,
    mask: HTMLCanvasElement,
    options?: HeightOptions,
  ): Promise<HeightResult> {
    if (!this.primaryDisabled) {
      try {
        return await this.primary.extractHeight(image, mask, options);
      } catch (err) {
        console.warn(
          'Depth model unavailable, falling back to luminance high-pass.',
          err,
        );
        // One failure (download blocked, WebGPU+WASM both refused) is enough
        // to lock the fallback in for the rest of the session.
        this.primaryDisabled = true;
      }
    }
    return this.fallback.extractHeight(image, mask, options);
  }
}

export const heightExtractor: HeightExtractor = new DepthOrLuminanceExtractor();
