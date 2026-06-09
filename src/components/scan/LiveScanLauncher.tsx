import { useState } from 'react';
import { LiveScanner } from './LiveScanner';

/**
 * Floating action that opens the live relief sensor. Kept separate from the
 * scanner so the heavy camera + depth machinery only mounts on demand.
 */
export function LiveScanLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="live-scan-launcher"
        onClick={() => setOpen(true)}
        aria-label="Open live relief sensor"
      >
        ◉ Live scan
      </button>
      {open && <LiveScanner onClose={() => setOpen(false)} />}
    </>
  );
}
