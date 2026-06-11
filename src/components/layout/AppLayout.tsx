import { SceneCanvas } from '../viewer/SceneCanvas';
import { ProxyControls } from '../viewer/ProxyControls';
import { ReliefControl } from '../viewer/ReliefControl';
import { ReconstructionPanel } from '../viewer/ReconstructionPanel';
import { ServerStatus } from '../viewer/ServerStatus';
import { UploadPanel } from '../upload/UploadPanel';
import { LiveScanLauncher } from '../scan/LiveScanLauncher';
import { BlueprintMode } from '../blueprint/BlueprintMode';
import { useStudioStore } from '../../state/useStudioStore';

/**
 * Mobile-first studio shell.
 *
 * The 3D canvas is full-bleed and dominant; the proxy toggle and the 6-slot
 * upload net float above it as light, translucent overlays. In projector
 * (blueprint) mode the studio chrome hides so only the aspect guide and the
 * export panel remain over the projector POV.
 */
export function AppLayout() {
  const projectorMode = useStudioStore((state) => state.projectorMode);

  return (
    <div className="app">
      <SceneCanvas />
      {!projectorMode && (
        <>
          <ServerStatus />
          <ProxyControls />
          <ReliefControl />
          <ReconstructionPanel />
          <UploadPanel />
          <LiveScanLauncher />
        </>
      )}
      <BlueprintMode />
    </div>
  );
}
