import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useStudioStore } from '../../state/useStudioStore';
import { useImageTexture } from '../../hooks/useImageTexture';
import {
  createBoxProjectionMaterial,
  FACE_FLAG_UNIFORM,
  FACE_TEXTURE_UNIFORM,
} from '../../three/BoxProjectionMaterial';
import type { FaceKey } from '../../types';
import { FACE_ORDER } from '../../types';

/**
 * The base proxy primitive (Phase 2).
 *
 * A sphere stands in for stones, a cylinder for branches. The box-projection
 * shader is attached and wired to all 6 face textures; later phases will add a
 * depth-derived `displacementMap` for natural surface relief.
 */
export function ProxyObject() {
  const proxyKind = useStudioStore((state) => state.proxyKind);
  const slots = useStudioStore((state) => state.slots);

  // One texture binding per face (hook order stays stable across renders).
  const textures: Record<FaceKey, THREE.Texture | null> = {
    front: useImageTexture(slots.front.maskUrl),
    back: useImageTexture(slots.back.maskUrl),
    left: useImageTexture(slots.left.maskUrl),
    right: useImageTexture(slots.right.maskUrl),
    top: useImageTexture(slots.top.maskUrl),
    bottom: useImageTexture(slots.bottom.maskUrl),
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
      ? new THREE.SphereGeometry(1, 96, 96)
      : new THREE.CylinderGeometry(0.72, 0.72, 2.4, 96, 64, false);
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

  // Feed uploaded face textures (or clear them) into the shader uniforms.
  useEffect(() => {
    for (const face of FACE_ORDER) {
      const texture = textures[face];
      material.uniforms[FACE_FLAG_UNIFORM[face]].value = texture !== null;
      material.uniforms[FACE_TEXTURE_UNIFORM[face]].value =
        texture ?? blankTexture;
    }
  }, [
    material,
    blankTexture,
    textures.front,
    textures.back,
    textures.left,
    textures.right,
    textures.top,
    textures.bottom,
  ]);

  return <mesh geometry={geometry} material={material} />;
}
