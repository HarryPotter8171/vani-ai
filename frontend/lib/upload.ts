import { getApiBaseUrl } from '@/lib/constants';
import { apiFetch, apiUploadXHR, getCachedAccessToken, getAccessToken } from '@/lib/apiClient';

export interface UploadedFileMeta {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  kind?: string;
  createdAt?: string;
}

export interface UploadProgressEvent {
  loaded: number;
  total: number;
  /** 0–100 when length is computable; otherwise omitted. */
  percent?: number;
}

export interface UploadFilesOptions {
  signal?: AbortSignal;
  names?: string[];
  onProgress?: (event: UploadProgressEvent) => void;
}

/**
 * Upload one or more files to POST /api/files/upload via authenticated XHR.
 */
export function uploadFilesToServer(
  files: Array<Blob | File>,
  signalOrOptions?: AbortSignal | UploadFilesOptions,
  namesArg?: string[]
): Promise<UploadedFileMeta[]> {
  if (!files.length) return Promise.resolve([]);

  const options: UploadFilesOptions =
    signalOrOptions instanceof AbortSignal || signalOrOptions == null
      ? { signal: signalOrOptions ?? undefined, names: namesArg }
      : signalOrOptions;

  const { signal, names, onProgress } = options;

  const form = new FormData();
  files.forEach((file, index) => {
    const filename =
      names?.[index] ||
      (file instanceof File && file.name ? file.name : `file-${index + 1}`);
    form.append('files', file, filename);
  });

  return apiUploadXHR('/files/upload', form, { signal, onProgress }).then((body) => {
    const files = (body as { files?: UploadedFileMeta[] })?.files;
    return Array.isArray(files) ? files : [];
  });
}

/**
 * Best-effort server cleanup when the user cancels/removes a composer attachment
 * after POST /files/upload already returned an id.
 */
export async function deleteUploadedFileOnServer(fileId: string): Promise<void> {
  const id = String(fileId || '').trim();
  if (!id) return;
  try {
    await apiFetch(`/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {
    // Ignore — cancel/remove must not fail the UI if cleanup races or network drops.
  }
}

/** Convert raw base64 (no data-URL prefix) into a Blob for upload. */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
}

/**
 * Durable preview / download URL for an uploaded file id.
 * Prefers a cached session JWT query param for <img src> compatibility.
 */
export function fileContentUrl(fileId: string, options?: { download?: boolean }): string {
  const base = `${getApiBaseUrl()}/files/${encodeURIComponent(fileId)}/content`;
  const params = new URLSearchParams();
  if (options?.download) params.set('download', '1');
  const token = getCachedAccessToken();
  if (token) params.set('access_token', token);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Resolve a short-lived signed content URL (preferred for embeds). */
export async function getSignedFileContentUrl(
  fileId: string,
  options?: { download?: boolean }
): Promise<string> {
  await getAccessToken();
  const params = new URLSearchParams();
  if (options?.download) params.set('download', '1');
  const qs = params.toString();
  const path = `/files/${encodeURIComponent(fileId)}/signed-url${qs ? `?${qs}` : ''}`;
  const { apiFetch } = await import('@/lib/apiClient');
  const res = await apiFetch(path);
  if (!res.ok) {
    // Fall back to session-token query URL
    return fileContentUrl(fileId, options);
  }
  const data = (await res.json()) as { url?: string };
  if (!data.url) return fileContentUrl(fileId, options);
  if (data.url.startsWith('http')) return data.url;
  // Backend may return /api/files/... or files/...
  const apiBase = getApiBaseUrl();
  if (data.url.startsWith('/api/')) {
    const origin = apiBase.replace(/\/api\/?$/, '');
    return `${origin}${data.url}`;
  }
  return `${apiBase}/${data.url.replace(/^\//, '')}`;
}
