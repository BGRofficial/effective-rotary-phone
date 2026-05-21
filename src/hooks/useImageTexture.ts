import { useEffect, useState } from 'react';
import * as THREE from 'three';

/**
 * Loads an image URL into a Three.js texture and disposes it on change/unmount.
 *
 * The texture keeps the default `NoColorSpace` so the box-projection
 * ShaderMaterial — which writes `gl_FragColor` straight to the sRGB drawing
 * buffer — reproduces the source photo without a darkening shift.
 */
export function useImageTexture(url: string | null): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!url) {
      setTexture(null);
      return;
    }

    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load(
      url,
      (loaded) => {
        if (cancelled) {
          loaded.dispose();
          return;
        }
        loaded.colorSpace = THREE.NoColorSpace;
        loaded.needsUpdate = true;
        setTexture(loaded);
      },
      undefined,
      () => {
        if (!cancelled) setTexture(null);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [url]);

  // Release the GPU texture once it is replaced or the component unmounts.
  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  return texture;
}
