import { useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { ProxyObject } from './ProxyObject';

/** Bounding radius that comfortably covers both proxy primitives. */
const PROXY_BOUNDING_RADIUS = 1.6;

/**
 * Frames the proxy by deriving the camera distance from the viewport aspect,
 * so the object fits with margin in portrait (width-limited) and landscape
 * alike. Re-runs on resize / orientation change.
 */
function ResponsiveFraming() {
  const camera = useThree((state) => state.camera);
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const aspect = width / Math.max(height, 1);
    const halfFov = (camera.fov * Math.PI) / 360;
    const fillFactor = 0.8;
    const limitingAxis = Math.min(1, aspect);
    const distance =
      PROXY_BOUNDING_RADIUS / (fillFactor * Math.tan(halfFov) * limitingAxis);
    camera.position.setLength(THREE.MathUtils.clamp(distance, 4, 18));
    camera.updateProjectionMatrix();
  }, [camera, width, height]);

  return null;
}

/**
 * The central Three.js stage.
 *
 * The proxy material is self-lit (no scene lights needed). A slow auto-rotate
 * gives the object presence while idle; touch and mouse orbit are enabled.
 */
export function SceneCanvas() {
  return (
    <Canvas
      className="scene-canvas"
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{ position: [0, 0.35, 7], fov: 42 }}
    >
      <color attach="background" args={['#121214']} />
      <ResponsiveFraming />
      <ProxyObject />
      <OrbitControls
        makeDefault
        target={[0, -0.8, 0]}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={3}
        maxDistance={18}
        autoRotate
        autoRotateSpeed={0.6}
      />
    </Canvas>
  );
}
