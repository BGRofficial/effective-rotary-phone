import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { useStudioStore } from '../../state/useStudioStore';
import { useImageTexture } from '../../hooks/useImageTexture';
import { registerBlueprintMesh } from '../../blueprint/blueprintBridge';
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
 * The proxy primitive (Phase 2 base + Phase R reconstruction).
 *
 * Primitive mode (sphere/cylinder) is the live-while-uploading view.
 * Mesh mode swaps in the server-reconstructed `.glb` geometry; the same
 * box-projection material drives color and per-face heightmap relief on it.
 */
export function ProxyObject() {
  const proxyKind = useStudioStore((state) => state.proxyKind);
  const slots = useStudioStore((state) => state.slots);
  const reliefStrength = useStudioStore((state) => state.reliefStrength);
  const glbUrl = useStudioStore((state) => state.reconstruction.glbUrl);

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

  const primitiveGeometry = useMemo(() => {
    return proxyKind === 'cylinder'
      ? new THREE.CylinderGeometry(0.72, 0.72, 2.4, 128, 96, false)
      : new THREE.SphereGeometry(1, 128, 128);
  }, [proxyKind]);
  useEffect(() => () => primitiveGeometry.dispose(), [primitiveGeometry]);

  const [meshGeometry, setMeshGeometry] = useState<THREE.BufferGeometry | null>(
    null,
  );

  // Load the reconstructed mesh whenever the URL changes.
  useEffect(() => {
    if (!glbUrl) {
      setMeshGeometry(null);
      return;
    }
    let cancelled = false;
    const loader = new GLTFLoader();
    loader.load(
      glbUrl,
      (gltf) => {
        if (cancelled) return;
        let geom: THREE.BufferGeometry | null = null;
        gltf.scene.traverse((obj) => {
          if (geom !== null) return;
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh && mesh.geometry) {
            geom = mesh.geometry.clone();
            if (!geom.getAttribute('normal')) {
              geom.computeVertexNormals();
            }
          }
        });
        setMeshGeometry(geom);
      },
      undefined,
      (err) => {
        console.error('Failed to load reconstructed mesh', err);
        if (!cancelled) setMeshGeometry(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [glbUrl]);

  // Dispose the loaded mesh geometry on change/unmount.
  useEffect(() => {
    return () => {
      meshGeometry?.dispose();
    };
  }, [meshGeometry]);

  const useMesh = proxyKind === 'mesh' && meshGeometry !== null;
  const geometry = useMesh
    ? (meshGeometry as THREE.BufferGeometry)
    : primitiveGeometry;

  // Keep the shader's projection bounds aligned with whichever geometry is
  // active so box-projection UVs cover the object.
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

  // When the reconstructed mesh is active the geometry already carries the
  // real surface — fade out the heightmap-driven displacement so we don't
  // double-displace. The slider still tweaks fine detail in primitive mode.
  useEffect(() => {
    const scale = useMesh ? 0.15 : 1.0;
    material.uniforms.uHeightStrength.value = reliefStrength * scale;
  }, [material, reliefStrength, useMesh]);

  // Expose the live mesh to the blueprint generator (projector export).
  const meshRef = useRef<THREE.Mesh>(null);
  useEffect(() => {
    registerBlueprintMesh(meshRef.current);
    return () => registerBlueprintMesh(null);
  }, [geometry]);

  return <mesh ref={meshRef} geometry={geometry} material={material} />;
}
