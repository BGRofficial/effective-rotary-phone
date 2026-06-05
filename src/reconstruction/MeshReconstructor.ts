import type { FaceKey, FaceSlot } from '../types';
import { FACE_ORDER } from '../types';

/**
 * Base URL of the reconstruction server. Override via the Vite env var
 * `VITE_RECONSTRUCTION_API_URL` when the server runs somewhere else.
 */
export const RECONSTRUCTION_API_URL: string =
  (import.meta.env.VITE_RECONSTRUCTION_API_URL as string | undefined) ??
  'http://localhost:8000';

export interface JobStatus {
  job_id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  stage: string;
  progress: number;
  mesh_url: string | null;
  triangle_count: number | null;
  error: string | null;
}

/** Resolve a mesh URL from the server's relative path to an absolute one. */
export function resolveMeshUrl(meshUrl: string): string {
  return meshUrl.startsWith('http')
    ? meshUrl
    : `${RECONSTRUCTION_API_URL}${meshUrl}`;
}

/**
 * Submit the 6 silhouettes from the current slots to `/reconstruct` and
 * return the job id. Prefers the masked silhouette PNG (best for visual hull)
 * and falls back to the source upload when a mask is unavailable.
 */
export async function submitReconstruction(
  slots: Record<FaceKey, FaceSlot>,
): Promise<string> {
  const formData = new FormData();

  for (const face of FACE_ORDER) {
    const slot = slots[face];
    const url = slot.maskUrl ?? slot.sourceUrl;
    if (!url) {
      throw new Error(`Face "${face}" has no image to submit`);
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not read face "${face}" blob`);
    }
    const blob = await response.blob();
    formData.append(face, blob, `${face}.png`);
  }

  const res = await fetch(`${RECONSTRUCTION_API_URL}/reconstruct`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Reconstruction submit failed (${res.status}): ${text || res.statusText}`,
    );
  }
  const data = (await res.json()) as { job_id: string };
  return data.job_id;
}

/** Fetch the latest status of a reconstruction job. */
export async function fetchJobStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${RECONSTRUCTION_API_URL}/jobs/${jobId}`);
  if (!res.ok) {
    throw new Error(`Job poll failed (${res.status})`);
  }
  return (await res.json()) as JobStatus;
}
