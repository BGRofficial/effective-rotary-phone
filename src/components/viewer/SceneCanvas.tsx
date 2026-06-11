import { useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { ProxyObject } from './ProxyObject';
import { useStudioStore } from '../../state/useStudioStore';
import { registerBlueprintRenderer } from '../../blueprint/blueprintBridge';

/** Bounding radius that comfortably covers all proxy shapes (incl. mesh). */
const PROXY_BOUNDING_RADIUS = 1.7;

/** Default lens used outside projector mode. */
const DEFAULT_FOV = 42;

/**
 * Frames the proxy by deriving the camera distance from the viewport aspect,
 * so the object fits with margin in portrait (width-limited) and landscape
 * alike. Re-runs on resize / orientation change.
 */
function ResponsiveFraming() {
  const camera = useThree((state) => state.camera);
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);
  const projectorMode = useStudioStore((state) => state.projectorMode);

  useEffect(() => {
    if (projectorMode) return; // projector framing is handled separately
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const aspect = width / Math.max(height, 1);
    const halfFov = (camera.fov * Math.PI) / 360;
    const fillFactor = 0.8;
    const limitingAxis = Math.min(1, aspect);
    const distance =
      PROXY_BOUNDING_RADIUS / (fillFactor * Math.tan(halfFov) * limitingAxis);
    camera.position.setLength(THREE.MathUtils.clamp(distance, 4, 18));
    camera.updateProjectionMatrix();
  }, [camera, width, height, projectorMode]);

  return null;
}

/**
 * Registers the renderer/camera with the blueprint bridge, applies the
 * virtual projector lens while projector mode is active, and on entry pulls
 * the camera back so the object fits inside the aspect guide.
 */
function BlueprintBridge() {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const controls = useThree(
    (state) => state.controls as OrbitControlsImpl | null,
  );
  const projectorMode = useStudioStore((state) => state.projectorMode);
  const projectorFov = useStudioStore((state) => state.projectorFov);
  const projectorAspect = useStudioStore((state) => state.projectorAspect);

  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      registerBlueprintRenderer(gl, camera);
    }
  }, [gl, camera]);

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    camera.fov = projectorMode ? projectorFov : DEFAULT_FOV;
    camera.updateProjectionMatrix();
  }, [camera, projectorMode, projectorFov]);

  // On entering projector mode (or switching guide aspect), dolly out so the
  // whole object sits inside the aspect guide. Mirrors the CSS guide sizing
  // in BlueprintMode: width = min(92vw, 62vh * aspect).
  useEffect(() => {
    if (!projectorMode || !controls) return;
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const timer = window.setTimeout(() => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const guideW = Math.min(0.92 * vw, 0.62 * vh * projectorAspect);
      const guideH = guideW / projectorAspect;
      const fov = useStudioStore.getState().projectorFov;
      const halfTan = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
      const guideFraction = Math.min(guideW, guideH) / vh;
      const distance = THREE.MathUtils.clamp(
        PROXY_BOUNDING_RADIUS / (0.72 * halfTan * guideFraction),
        3,
        40,
      );
      const offset = camera.position.clone().sub(controls.target);
      camera.position
        .copy(controls.target)
        .add(offset.setLength(distance));
      controls.update();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [projectorMode, projectorAspect, camera, controls]);

  return null;
}

/**
 * The central Three.js stage.
 *
 * The proxy material is self-lit (no scene lights needed). A slow auto-rotate
 * gives the object presence while idle; it pauses in projector mode so the
 * artist can hold a precise projector POV. In projector mode the orbit target
 * recenters on the object so it sits in the middle of the aspect guide.
 */
export function SceneCanvas() {
  const projectorMode = useStudioStore((state) => state.projectorMode);

  return (
    <Canvas
      className="scene-canvas"
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{ position: [0, 0.35, 7], fov: DEFAULT_FOV }}
    >
      <color attach="background" args={['#121214']} />
      <ResponsiveFraming />
      <BlueprintBridge />
      <ProxyObject />
      <OrbitControls
        makeDefault
        target={projectorMode ? [0, 0, 0] : [0, -0.8, 0]}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={3}
        maxDistance={projectorMode ? 40 : 18}
        autoRotate={!projectorMode}
        autoRotateSpeed={0.6}
      />
    </Canvas>
  );
}
