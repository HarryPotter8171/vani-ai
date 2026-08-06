import { getApiBaseUrl } from '@/lib/constants';
import { apiFetch, getCachedAccessToken, apiUploadXHR } from '@/lib/apiClient';
import type {
  CodeInterpreterHealth,
  CodeSession,
  ExecutionResult,
  GeneratedFile,
  StreamEvent,
} from './types';

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const { throwIfGateBody } = await import('@/lib/billing/gateError');
    throwIfGateBody(res.status, data);
    throw new Error(
      (data as { error?: string }).error || `Request failed (${res.status})`
    );
  }
  return data as T;
}

export async function fetchCodeHealth(): Promise<CodeInterpreterHealth> {
  const res = await apiFetch('/code/health');
  return parseJson(res);
}

export async function createCodeSession(): Promise<CodeSession> {
  const res = await apiFetch('/code/sessions', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const data = await parseJson<{ session: CodeSession }>(res);
  return data.session;
}

export async function fetchCodeSession(sessionId: string): Promise<CodeSession> {
  const res = await apiFetch(`/code/sessions/${sessionId}`);
  const data = await parseJson<{ session: CodeSession }>(res);
  return data.session;
}

export async function fetchCodeSessions(): Promise<CodeSession[]> {
  const res = await apiFetch('/code/sessions');
  const data = await parseJson<{ sessions: CodeSession[] }>(res);
  return data.sessions || [];
}

export async function destroyCodeSession(sessionId: string): Promise<void> {
  const res = await apiFetch(`/code/sessions/${sessionId}`, { method: 'DELETE' });
  await parseJson(res);
}

export async function executeCode(
  sessionId: string,
  code: string,
  opts: { timeoutMs?: number } = {}
): Promise<{ result: ExecutionResult; session: CodeSession }> {
  const res = await apiFetch(`/code/sessions/${sessionId}/execute`, {
    method: 'POST',
    body: JSON.stringify({ code, timeoutMs: opts.timeoutMs }),
  });
  return parseJson(res);
}

/** SSE streaming execute — yields stream events then resolves with final result. */
export async function executeCodeStream(
  sessionId: string,
  code: string,
  onEvent: (event: StreamEvent) => void,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<ExecutionResult | null> {
  const token = getCachedAccessToken();
  const res = await fetch(`${getApiBaseUrl()}/code/sessions/${sessionId}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ code, timeoutMs: opts.timeoutMs, stream: true }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `Execute failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: ExecutionResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      const line = part
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith('data:'));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const event = JSON.parse(payload) as StreamEvent;
        if (event.type === 'result_complete' && event.result) {
          finalResult = event.result;
        } else {
          onEvent(event);
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }

  return finalResult;
}

export async function interruptCodeSession(sessionId: string): Promise<CodeSession> {
  const res = await apiFetch(`/code/sessions/${sessionId}/interrupt`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const data = await parseJson<{ session: CodeSession }>(res);
  return data.session;
}

export async function restartCodeKernel(sessionId: string): Promise<CodeSession> {
  const res = await apiFetch(`/code/sessions/${sessionId}/restart`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const data = await parseJson<{ session: CodeSession }>(res);
  return data.session;
}

export async function uploadCodeFile(
  sessionId: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<GeneratedFile> {
  const form = new FormData();
  form.append('file', file);
  const data = (await apiUploadXHR(`/code/sessions/${sessionId}/files`, form, {
    onProgress: (event) => {
      if (onProgress && typeof event.percent === 'number') onProgress(event.percent);
    },
  })) as { file?: GeneratedFile; error?: string };
  if (!data?.file) {
    throw new Error(data?.error || 'Upload failed');
  }
  return data.file;
}

export function codeFileDownloadUrl(sessionId: string, fileId: string): string {
  const base = `${getApiBaseUrl()}/code/sessions/${sessionId}/files/${fileId}`;
  const params = new URLSearchParams();
  const token = getCachedAccessToken();
  if (token) params.set('access_token', token);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export async function publishCodeToCanvas(
  sessionId: string,
  opts: { title?: string; chatId?: string } = {}
): Promise<{ canvasId: string }> {
  const res = await apiFetch(`/code/sessions/${sessionId}/publish-canvas`, {
    method: 'POST',
    body: JSON.stringify(opts),
  });
  return parseJson(res);
}
