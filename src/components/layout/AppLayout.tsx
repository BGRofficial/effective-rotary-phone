import { SceneCanvas } from '../viewer/SceneCanvas';
import { ProxyControls } from '../viewer/ProxyControls';
import { ReliefControl } from '../viewer/ReliefControl';
import { ReconstructionPanel } from '../viewer/ReconstructionPanel';
import { ServerStatus } from '../viewer/ServerStatus';
import { UploadPanel } from '../upload/UploadPanel';
import { LiveScanLauncher } from '../scan/LiveScanLauncher';

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
      <ServerStatus />
      <ProxyControls />
      <ReliefControl />
      <ReconstructionPanel />
      <UploadPanel />
      <LiveScanLauncher />
    </div>
  );
}
