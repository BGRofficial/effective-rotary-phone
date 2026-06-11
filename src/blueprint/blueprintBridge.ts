import type * as THREE from 'three';

/**
 * Bridge between the React-Three Canvas internals and the blueprint
 * generator, which runs outside the Canvas tree (in the projector-mode UI).
 *
 * The Canvas registers its renderer + camera, and ProxyObject registers the
 * live proxy mesh. `generateBlueprint` reads whatever is registered at the
 * moment of export — no React coupling needed.
 */

interface BlueprintRegistry {
  gl: THREE.WebGLRenderer | null;
  camera: THREE.PerspectiveCamera | null;
  mesh: THREE.Mesh | null;
}

const registry: BlueprintRegistry = {
  gl: null,
  camera: null,
  mesh: null,
};

export function registerBlueprintRenderer(
  gl: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
): void {
  registry.gl = gl;
  registry.camera = camera;
}

export function registerBlueprintMesh(mesh: THREE.Mesh | null): void {
  registry.mesh = mesh;
}

export interface BlueprintContext {
  gl: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  mesh: THREE.Mesh;
}

export function getBlueprintContext(): BlueprintContext | null {
  if (!registry.gl || !registry.camera || !registry.mesh) return null;
  return {
    gl: registry.gl,
    camera: registry.camera,
    mesh: registry.mesh,
  };
}
