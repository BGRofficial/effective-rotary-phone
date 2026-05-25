import { SceneCanvas } from '../viewer/SceneCanvas';
import { ProxyControls } from '../viewer/ProxyControls';
import { ReliefControl } from '../viewer/ReliefControl';
import { UploadPanel } from '../upload/UploadPanel';

/**
 * Mobile-first studio shell.
 *
 * The 3D canvas is full-bleed and dominant; the proxy toggle and the 6-slot
 * upload net float above it as light, translucent overlays.
 */
export function AppLayout() {
  return (
    <div className="app">
      <SceneCanvas />
      <ProxyControls />
      <ReliefControl />
      <UploadPanel />
    </div>
  );
}
