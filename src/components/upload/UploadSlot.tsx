import { useRef, useState } from 'react';
import { useStudioStore } from '../../state/useStudioStore';
import type { FaceKey } from '../../types';
import { FACE_META } from '../../types';

interface UploadSlotProps {
  face: FaceKey;
}

/**
 * One face of the object: tap or drop an image to upload. Once processed it
 * shows the extracted silhouette; the toggle flips between the cutout and the
 * original photo so the artist can verify the mask.
 */
export function UploadSlot({ face }: UploadSlotProps) {
  const slot = useStudioStore((state) => state.slots[face]);
  const loadSlotImage = useStudioStore((state) => state.loadSlotImage);
  const clearSlot = useStudioStore((state) => state.clearSlot);

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showSource, setShowSource] = useState(false);

  const meta = FACE_META[face];
  const filled = slot.status !== 'empty';
  const previewUrl = showSource
    ? slot.sourceUrl
    : (slot.maskUrl ?? slot.sourceUrl);

  const acceptFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file && file.type.startsWith('image/')) {
      void loadSlotImage(face, file);
    }
  };

  const openPicker = () => inputRef.current?.click();

  return (
    <div
      className={`upload-slot upload-slot--${face}${
        dragOver ? ' is-dragover' : ''
      }${slot.status === 'error' ? ' is-error' : ''}`}
    >
      <div
        className="upload-slot__zone"
        role="button"
        tabIndex={0}
        aria-label={`${meta.label} image`}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          acceptFiles(event.dataTransfer.files);
        }}
      >
        {previewUrl ? (
          <img className="upload-slot__preview" src={previewUrl} alt="" />
        ) : (
          <span className="upload-slot__plus" aria-hidden="true">
            +
          </span>
        )}

        {slot.status === 'processing' && (
          <span className="upload-slot__spinner" aria-hidden="true" />
        )}

        <span className="upload-slot__label">{meta.label}</span>
      </div>

      {filled && (
        <button
          type="button"
          className="upload-slot__clear"
          aria-label={`Clear ${meta.label}`}
          onClick={() => clearSlot(face)}
        >
          &times;
        </button>
      )}

      {slot.status === 'ready' && slot.maskUrl && (
        <button
          type="button"
          className="upload-slot__toggle"
          aria-label={showSource ? 'Show silhouette' : 'Show original'}
          aria-pressed={showSource}
          onClick={() => setShowSource((value) => !value)}
        >
          {showSource ? '○' : '●'}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="upload-slot__input"
        onChange={(event) => {
          acceptFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </div>
  );
}
