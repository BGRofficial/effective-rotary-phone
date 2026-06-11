/** Browser download helpers for the blueprint exports. */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadText(
  text: string,
  filename: string,
  mime: string,
): void {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

/**
 * Rasterize an SVG document to a PNG blob at its native pixel size.
 * Decoding goes through an <img> with a blob URL, so the canvas stays
 * untainted (no external references inside the SVG).
 */
export async function svgToPngBlob(
  svg: string,
  width: number,
  height: number,
): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('SVG rasterization failed'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    );
    if (!blob) throw new Error('PNG encoding failed');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
