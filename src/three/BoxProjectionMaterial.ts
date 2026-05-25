import * as THREE from 'three';
import type { FaceKey } from '../types';
import vertexShader from '../shaders/boxProjection.vert.glsl?raw';
import fragmentShader from '../shaders/boxProjection.frag.glsl?raw';

/** Uniform name carrying the projected image for each face. */
export const FACE_TEXTURE_UNIFORM: Record<FaceKey, string> = {
  front: 'uTexFront',
  back: 'uTexBack',
  left: 'uTexLeft',
  right: 'uTexRight',
  top: 'uTexTop',
  bottom: 'uTexBottom',
};

/** Uniform name of the boolean "this face has an image" flag. */
export const FACE_FLAG_UNIFORM: Record<FaceKey, string> = {
  front: 'uHasFront',
  back: 'uHasBack',
  left: 'uHasLeft',
  right: 'uHasRight',
  top: 'uHasTop',
  bottom: 'uHasBottom',
};

/** Uniform name carrying the heightmap (scan result) for each face. */
export const FACE_HEIGHT_UNIFORM: Record<FaceKey, string> = {
  front: 'uHeightFront',
  back: 'uHeightBack',
  left: 'uHeightLeft',
  right: 'uHeightRight',
  top: 'uHeightTop',
  bottom: 'uHeightBottom',
};

/** Uniform name of the boolean "this face has a heightmap" flag. */
export const FACE_HEIGHT_FLAG_UNIFORM: Record<FaceKey, string> = {
  front: 'uHasHeightFront',
  back: 'uHasHeightBack',
  left: 'uHasHeightLeft',
  right: 'uHasHeightRight',
  top: 'uHasHeightTop',
  bottom: 'uHasHeightBottom',
};

/** 1x1 transparent texture used as the default for unfilled sampler uniforms. */
function createBlankTexture(): THREE.Texture {
  const texture = new THREE.DataTexture(
    new Uint8Array([0, 0, 0, 0]),
    1,
    1,
    THREE.RGBAFormat,
  );
  texture.needsUpdate = true;
  return texture;
}

/**
 * Builds the box-projection material. All 6 image + height samplers start as
 * blank transparent textures with their flags off, so the proxy renders as a
 * flat Zen-gray solid (and stays un-displaced) until images are uploaded.
 */
export function createBoxProjectionMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTexFront: { value: createBlankTexture() },
      uTexBack: { value: createBlankTexture() },
      uTexLeft: { value: createBlankTexture() },
      uTexRight: { value: createBlankTexture() },
      uTexTop: { value: createBlankTexture() },
      uTexBottom: { value: createBlankTexture() },

      uHasFront: { value: false },
      uHasBack: { value: false },
      uHasLeft: { value: false },
      uHasRight: { value: false },
      uHasTop: { value: false },
      uHasBottom: { value: false },

      uHeightFront: { value: createBlankTexture() },
      uHeightBack: { value: createBlankTexture() },
      uHeightLeft: { value: createBlankTexture() },
      uHeightRight: { value: createBlankTexture() },
      uHeightTop: { value: createBlankTexture() },
      uHeightBottom: { value: createBlankTexture() },

      uHasHeightFront: { value: false },
      uHasHeightBack: { value: false },
      uHasHeightLeft: { value: false },
      uHasHeightRight: { value: false },
      uHasHeightTop: { value: false },
      uHasHeightBottom: { value: false },

      uHeightStrength: { value: 0.0 },

      uBoundsMin: { value: new THREE.Vector3(-1, -1, -1) },
      uBoundsMax: { value: new THREE.Vector3(1, 1, 1) },
      uBlendSharpness: { value: 4.0 },
      // Stored raw (no sRGB->linear conversion) since this raw ShaderMaterial
      // writes gl_FragColor straight to the sRGB drawing buffer.
      uBaseColor: {
        value: new THREE.Color().setHex(0x8d8c87, THREE.LinearSRGBColorSpace),
      },
    },
  });
}
