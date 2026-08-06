/**
 * Deep Research API client — SSE run + session controls.
 */

import { apiFetch } from '@/lib/apiClient';
import type { ResearchStreamEvent } from './types';

async function parseSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ResearchStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    if (signal?.aborted) {
      await reader.cancel().catch(() => undefined);
      break;
    }

    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith('data:')) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr) continue;
      try {
        onEvent(JSON.parse(jsonStr) as ResearchStreamEvent);
      } catch {
        /* ignore malformed frames */
      }
    }
  }
}

export interface ResearchRunRequest {
  query: string;
  chatId?: string | null;
  projectId?: string | null;
  resumeSessionId?: string | null;
}

export async function runResearchStream(
  request: ResearchRunRequest,
  {
    signal,
    onEvent,
  }: {
    signal?: AbortSignal;
    onEvent: (event: ResearchStreamEvent) => void;
  }
): Promise<{ sessionId?: string; chatId?: string }> {
  const res = await apiFetch('/research/run', {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!res.ok) {
    const { parseGateDenial, GateDenialError } = await import(
      '@/lib/billing/gateError'
    );
    const denial = await parseGateDenial(res);
    if (denial) throw new GateDenialError(denial);
    let message = `Research failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  if (!res.body) throw new Error('No research stream');

  let sessionId: string | undefined;
  let chatId: string | undefined;

  await parseSseStream(
    res.body,
    (event) => {
      if (event.sessionId) sessionId = event.sessionId;
      if (event.chatId) chatId = event.chatId;
      onEvent(event);
    },
    signal
  );

  return { sessionId, chatId };
}

export async function cancelResearchSession(sessionId: string): Promise<boolean> {
  try {
    const res = await apiFetch(`/research/sessions/${sessionId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Cancelled by user' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function pauseResearchSession(sessionId: string): Promise<boolean> {
  try {
    const res = await apiFetch(`/research/sessions/${sessionId}/pause`, {
      method: 'POST',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function resumeResearchSession(sessionId: string): Promise<boolean> {
  try {
    const res = await apiFetch(`/research/sessions/${sessionId}/resume`, {
      method: 'POST',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchResearchSession(sessionId: string) {
  const res = await apiFetch(`/research/sessions/${sessionId}`);
  if (!res.ok) throw new Error('Research session not found');
  return res.json();
}
