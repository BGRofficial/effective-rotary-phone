import type { HeightExtractor, HeightOptions, HeightResult } from '../types';
import { RemoteDepthExtractor } from './remoteDepthExtractor';
import { TransformersDepthExtractor } from './transformersDepthExtractor';
import { WebGLLuminanceHeightExtractor } from './webglLuminanceHeightExtractor';
import { smoothHeightmap } from './heightSmoother';

export type { HeightExtractor } from '../types';

/**
 * Three-tier extractor with graceful degradation:
 *
 *  1. **Remote depth** — `/depth` on the reconstruction server (DepthAnything
 *     V2 ONNX, server-side). Best quality + fast on a host with proper
 *     compute; used when the server is reachable.
 *  2. **Browser depth** — DepthAnything V2 in-browser via
 *     `@huggingface/transformers`. Works offline once the model is cached.
 *  3. **Luminance high-pass** — pure WebGL, no model. Final safety net.
 *
 * Each tier is tried in order; a failure locks that tier off for the
 * remainder of the session so we don't pay the timeout twice. The interface
 * exposed to callers (`useStudioStore.loadSlotImage`) doesn't change.
 */
class CompositeHeightExtractor implements HeightExtractor {
  private readonly remote = new RemoteDepthExtractor();
  private readonly browser = new TransformersDepthExtractor();
  private readonly luminance = new WebGLLuminanceHeightExtractor();
  private remoteDisabled = false;
  private browserDisabled = false;

  async extractHeight(
    image: ImageBitmap,
    mask: HTMLCanvasElement,
    options?: HeightOptions,
  ): Promise<HeightResult> {
    const raw = await this.extractRaw(image, mask, options);
    // CPU mask-aware pre-blur kills the baseline per-pixel noise; the
    // vertex shader's runtime Gaussian then provides macro smoothing on
    // top, with the Smooth slider as live control.
    return {
      width: raw.width,
      height: raw.height,
      heightCanvas: smoothHeightmap(raw.heightCanvas),
    };
  }

  private async extractRaw(
    image: ImageBitmap,
    mask: HTMLCanvasElement,
    options?: HeightOptions,
  ): Promise<HeightResult> {
    if (!this.remoteDisabled) {
      try {
        return await this.remote.extractHeight(image, mask, options);
      } catch (err) {
        console.warn(
          'Server depth unavailable — switching to in-browser depth model.',
          err,
        );
        this.remoteDisabled = true;
      }
    }
    if (!this.browserDisabled) {
      try {
        return await this.browser.extractHeight(image, mask, options);
      } catch (err) {
        console.warn(
          'Browser depth unavailable — falling back to luminance high-pass.',
          err,
        );
        this.browserDisabled = true;
      }
    }
    return this.luminance.extractHeight(image, mask, options);
  }
}

export const heightExtractor: HeightExtractor = new CompositeHeightExtractor();
