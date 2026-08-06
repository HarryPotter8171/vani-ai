import { apiFetch } from '@/lib/apiClient';
import type { VoiceMode, VoiceOption, VoiceSessionInfo } from '@/lib/voice/types';

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 400;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiFetchWithRetry(
  path: string,
  init?: Parameters<typeof apiFetch>[1],
  retries = MAX_RETRIES
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await apiFetch(path, init);
      // Retry transient network / rate-limit / gateway failures.
      if (res.status === 429 || res.status >= 500) {
        if (attempt === retries) return res;
        await sleep(RETRY_BASE_MS * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt === retries) throw err;
      await sleep(RETRY_BASE_MS * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Network request failed');
}

export async function createVoiceSession(input: {
  chatId?: string | null;
  projectId?: string | null;
  mode?: VoiceMode;
  voice?: string;
  speed?: number;
  language?: string;
}): Promise<{ session: VoiceSessionInfo; voices: VoiceOption[] }> {
  const res = await apiFetchWithRetry('/voice/session', {
    method: 'POST',
    body: JSON.stringify({
      chatId: input.chatId || undefined,
      projectId: input.projectId || undefined,
      mode: input.mode,
      voice: input.voice,
      speed: input.speed,
      language: input.language,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Unable to start voice session');
  }
  return res.json();
}

export async function patchVoiceSession(
  sessionId: string,
  patch: Record<string, unknown>
): Promise<VoiceSessionInfo> {
  const res = await apiFetchWithRetry(`/voice/session/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Unable to update voice session');
  }
  const data = await res.json();
  return data.session;
}

export async function endVoiceSession(sessionId: string): Promise<void> {
  try {
    await apiFetchWithRetry(`/voice/session/${sessionId}`, {
      method: 'DELETE',
    });
  } catch {
    // Best-effort cleanup on hang-up.
  }
}

export async function interruptVoiceSession(sessionId: string): Promise<void> {
  await apiFetchWithRetry('/voice/interrupt', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

export async function transcribeAudioBlob(
  blob: Blob,
  options: { sessionId?: string | null; language?: string } = {}
): Promise<{
  transcript: string;
  language: string;
  confidence: number;
}> {
  const form = new FormData();
  form.append('audio', blob, 'utterance.webm');
  if (options.sessionId) form.append('sessionId', options.sessionId);
  if (options.language) form.append('language', options.language);

  const res = await apiFetchWithRetry('/voice/stt', {
    method: 'POST',
    body: form,
    json: false,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Transcription failed');
  }
  return res.json();
}

export interface TtsMeta {
  sampleRate: number;
  channels: number;
  sampleWidth: number;
  format: string;
  voice: string;
  speed: number;
}

export interface TtsResult {
  audioBase64: string;
  sampleRate: number;
  channels: number;
  sampleWidth: number;
  voice: string;
  speed: number;
}

export async function synthesizeSpeech(input: {
  text: string;
  voice?: string;
  speed?: number;
  sessionId?: string | null;
  signal?: AbortSignal;
}): Promise<TtsResult> {
  const res = await apiFetchWithRetry(
    '/voice/tts',
    {
      method: 'POST',
      body: JSON.stringify({
        text: input.text,
        voice: input.voice,
        speed: input.speed,
        sessionId: input.sessionId || undefined,
        stream: false,
      }),
      signal: input.signal,
    },
    2
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Speech synthesis failed');
  }
  return res.json();
}

/**
 * Stream TTS over SSE. Invokes onMeta once, onAudio for each PCM chunk.
 */
export async function synthesizeSpeechStream(input: {
  text: string;
  voice?: string;
  speed?: number;
  sessionId?: string | null;
  signal?: AbortSignal;
  onMeta?: (meta: TtsMeta) => void;
  onAudio?: (chunk: ArrayBuffer, meta: TtsMeta | null) => void;
}): Promise<void> {
  const res = await apiFetch('/voice/tts', {
    method: 'POST',
    body: JSON.stringify({
      text: input.text,
      voice: input.voice,
      speed: input.speed,
      sessionId: input.sessionId || undefined,
      stream: true,
    }),
    signal: input.signal,
  });

  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Streaming speech failed');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let meta: TtsMeta | null = null;

  while (true) {
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

      let event: {
        type: string;
        data?: string;
        message?: string;
        sampleRate?: number;
        channels?: number;
        sampleWidth?: number;
        format?: string;
        voice?: string;
        speed?: number;
      };
      try {
        event = JSON.parse(jsonStr);
      } catch {
        continue;
      }

      if (event.type === 'meta') {
        meta = {
          sampleRate: event.sampleRate || 24000,
          channels: event.channels || 1,
          sampleWidth: event.sampleWidth || 2,
          format: event.format || 'pcm_s16le',
          voice: event.voice || 'Kore',
          speed: event.speed || 1,
        };
        input.onMeta?.(meta);
      } else if (event.type === 'audio' && event.data) {
        const binary = atob(event.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        input.onAudio?.(bytes.buffer, meta);
      } else if (event.type === 'error') {
        throw new Error(event.message || 'TTS stream error');
      }
    }
  }
}
