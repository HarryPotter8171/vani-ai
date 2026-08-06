import { apiFetch } from '@/lib/apiClient';
import type {
  CanvasAiAction,
  CanvasDocument,
  CanvasType,
  CanvasVersionSummary,
} from '@/lib/canvas/types';

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const { throwIfGateBody } = await import('@/lib/billing/gateError');
    throwIfGateBody(res.status, data);
    const err = new Error(
      (data as { error?: string }).error || `Request failed (${res.status})`
    ) as Error & {
      status?: number;
      code?: string;
      current?: CanvasDocument;
    };
    err.status = res.status;
    err.code = (data as { code?: string }).code;
    err.current = (data as { current?: CanvasDocument }).current;
    throw err;
  }
  return data as T;
}

export async function listCanvases(opts?: {
  chatId?: string | null;
  includeClosed?: boolean;
}): Promise<{ items: CanvasDocument[]; total: number }> {
  const params = new URLSearchParams();
  if (opts?.chatId) params.set('chatId', opts.chatId);
  if (opts?.includeClosed) params.set('includeClosed', 'true');
  const path = params.toString() ? `/canvas?${params.toString()}` : '/canvas';
  const res = await apiFetch(path);
  return parseJson(res);
}

export async function createCanvas(input: {
  title?: string;
  type: CanvasType;
  content?: string;
  language?: string | null;
  chatId?: string | null;
  sourceArtifactId?: string | null;
  syncFromArtifact?: boolean;
  pinned?: boolean;
}): Promise<CanvasDocument> {
  const res = await apiFetch('/canvas', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function getCanvas(id: string): Promise<CanvasDocument> {
  const res = await apiFetch(`/canvas/${id}`);
  return parseJson(res);
}

export async function updateCanvas(
  id: string,
  patch: Partial<Pick<CanvasDocument, 'title' | 'type' | 'language' | 'content' | 'pinned' | 'chatId'>> & {
    expectedRevision?: number;
    force?: boolean;
    source?: string;
    note?: string;
  }
): Promise<CanvasDocument> {
  const res = await apiFetch(`/canvas/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return parseJson(res);
}

export async function autosaveCanvas(
  id: string,
  body: { content?: string; title?: string; expectedRevision?: number }
): Promise<{ saved: boolean; canvas: CanvasDocument }> {
  const res = await apiFetch(`/canvas/${id}/autosave`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function renameCanvas(id: string, title: string): Promise<CanvasDocument> {
  const res = await apiFetch(`/canvas/${id}/title`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
  return parseJson(res);
}

export async function pinCanvas(id: string, pinned: boolean): Promise<CanvasDocument> {
  const res = await apiFetch(`/canvas/${id}/${pinned ? 'pin' : 'unpin'}`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return parseJson(res);
}

export async function closeCanvas(id: string): Promise<CanvasDocument> {
  const res = await apiFetch(`/canvas/${id}/close`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return parseJson(res);
}

export async function duplicateCanvas(id: string): Promise<CanvasDocument> {
  const res = await apiFetch(`/canvas/${id}/duplicate`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return parseJson(res);
}

export async function deleteCanvas(id: string): Promise<{ deleted: boolean; id: string }> {
  const res = await apiFetch(`/canvas/${id}`, {
    method: 'DELETE',
  });
  return parseJson(res);
}

export async function listCanvasVersions(
  id: string
): Promise<{ items: CanvasVersionSummary[]; total: number }> {
  const res = await apiFetch(`/canvas/${id}/versions`);
  return parseJson(res);
}

export async function getCanvasVersion(
  id: string,
  versionId: string
): Promise<CanvasVersionSummary> {
  const res = await apiFetch(`/canvas/${id}/versions/${versionId}`);
  return parseJson(res);
}

export async function restoreCanvasVersion(
  id: string,
  versionId: string
): Promise<CanvasDocument> {
  const res = await apiFetch(`/canvas/${id}/versions/${versionId}/restore`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return parseJson(res);
}

export async function aiEditCanvas(
  id: string,
  body: {
    action: CanvasAiAction;
    start?: number;
    end?: number;
    selectedText?: string;
    wholeDocument?: boolean;
    instruction?: string;
    targetLanguage?: string;
    expectedRevision?: number;
    force?: boolean;
  }
): Promise<{
  canvas: CanvasDocument;
  replacement: string;
  start: number;
  end: number;
  action: CanvasAiAction;
}> {
  const res = await apiFetch(`/canvas/${id}/ai-edit`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return parseJson(res);
}
