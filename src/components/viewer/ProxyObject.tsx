import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useStudioStore } from '../../state/useStudioStore';
import { useImageTexture } from '../../hooks/useImageTexture';
import {
  createBoxProjectionMaterial,
  FACE_FLAG_UNIFORM,
  FACE_HEIGHT_FLAG_UNIFORM,
  FACE_HEIGHT_UNIFORM,
  FACE_TEXTURE_UNIFORM,
} from '../../three/BoxProjectionMaterial';
import type { FaceKey } from '../../types';
import { FACE_ORDER } from '../../types';

/**
 * The base proxy primitive (Phase 2).
 *
 * A sphere stands in for stones, a cylinder for branches. The box-projection
 * shader is attached and wired to all 6 face textures and 6 heightmaps; the
 * vertex stage uses the heightmaps to displace the surface, giving the proxy
 * organic relief derived from the scanned photos.
 */
export function ProxyObject() {
  const proxyKind = useStudioStore((state) => state.proxyKind);
  const slots = useStudioStore((state) => state.slots);
  const reliefStrength = useStudioStore((state) => state.reliefStrength);

  // Color textures (mask result) per face.
  const colorTextures: Record<FaceKey, THREE.Texture | null> = {
    front: useImageTexture(slots.front.maskUrl),
    back: useImageTexture(slots.back.maskUrl),
    left: useImageTexture(slots.left.maskUrl),
    right: useImageTexture(slots.right.maskUrl),
    top: useImageTexture(slots.top.maskUrl),
    bottom: useImageTexture(slots.bottom.maskUrl),
  };

  // Heightmaps (scan result) per face.
  const heightTextures: Record<FaceKey, THREE.Texture | null> = {
    front: useImageTexture(slots.front.heightUrl),
    back: useImageTexture(slots.back.heightUrl),
    left: useImageTexture(slots.left.heightUrl),
    right: useImageTexture(slots.right.heightUrl),
    top: useImageTexture(slots.top.heightUrl),
    bottom: useImageTexture(slots.bottom.heightUrl),
  };

  const material = useMemo(() => createBoxProjectionMaterial(), []);
  useEffect(() => () => material.dispose(), [material]);

  const blankTexture = useMemo(() => {
    const texture = new THREE.DataTexture(
      new Uint8Array([0, 0, 0, 0]),
      1,
      1,
      THREE.RGBAFormat,
    );
    texture.needsUpdate = true;
    return texture;
  }, []);
  useEffect(() => () => blankTexture.dispose(), [blankTexture]);

  const geometry = useMemo(() => {
    return proxyKind === 'sphere'
      ? new THREE.SphereGeometry(1, 128, 128)
      : new THREE.CylinderGeometry(0.72, 0.72, 2.4, 128, 96, false);
  }, [proxyKind]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // Keep the shader's projection bounds aligned with the active geometry.
  useEffect(() => {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (box) {
      material.uniforms.uBoundsMin.value.copy(box.min);
      material.uniforms.uBoundsMax.value.copy(box.max);
    }
  }, [geometry, material]);

  // Feed uploaded color textures into the shader uniforms.
  useEffect(() => {
    for (const face of FACE_ORDER) {
      const texture = colorTextures[face];
      material.uniforms[FACE_FLAG_UNIFORM[face]].value = texture !== null;
      material.uniforms[FACE_TEXTURE_UNIFORM[face]].value =
        texture ?? blankTexture;
    }
  }, [
    material,
    blankTexture,
    colorTextures.front,
    colorTextures.back,
    colorTextures.left,
    colorTextures.right,
    colorTextures.top,
    colorTextures.bottom,
  ]);

  // Feed uploaded heightmaps into the shader uniforms.
  useEffect(() => {
    for (const face of FACE_ORDER) {
      const texture = heightTextures[face];
      material.uniforms[FACE_HEIGHT_FLAG_UNIFORM[face]].value = texture !== null;
      material.uniforms[FACE_HEIGHT_UNIFORM[face]].value =
        texture ?? blankTexture;
    }
  }, [
    material,
    blankTexture,
    heightTextures.front,
    heightTextures.back,
    heightTextures.left,
    heightTextures.right,
    heightTextures.top,
    heightTextures.bottom,
  ]);

  // Live-update the global displacement amplitude.
  useEffect(() => {
    material.uniforms.uHeightStrength.value = reliefStrength;
  }, [material, reliefStrength]);

  return <mesh geometry={geometry} material={material} />;
}
