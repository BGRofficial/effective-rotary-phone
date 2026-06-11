import { UploadSlot } from './UploadSlot';
import { FACE_ORDER } from '../../types';

/**
 * The 6 face slots arranged as an unfolded-cube cross net:
 *
 *        [ Top ]
 * [Left][Front][Right]
 *       [Bottom]
 *       [ Back ]
 *
 * The layout mirrors the box-projection mental model and stays 3 columns wide
 * so it fits comfortably as a floating overlay on mobile.
 */
export function UploadPanel() {
  return (
    <div className="upload-panel" aria-label="Object face images">
      {FACE_ORDER.map((face) => (
        <UploadSlot key={face} face={face} />
      ))}
    </div>
  );
}
