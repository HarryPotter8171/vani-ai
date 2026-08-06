/**
 * Duplex Voice WebSocket client.
 * Streams mic audio up; receives transcripts + progressive TTS PCM down.
 * Auto-reconnects with exponential backoff; keepalive ping while open.
 */

import { getApiBaseUrl } from '@/lib/constants';
import { getAccessToken } from '@/lib/apiClient';
import { safeUrl } from '@/lib/safeUrl';
import type { VoiceSessionInfo } from '@/lib/voice/types';

export type VoiceSocketEvent =
  | { type: 'ready'; session: VoiceSessionInfo | null; capabilities?: Record<string, unknown> }
  | { type: 'state'; session: VoiceSessionInfo | null }
  | { type: 'transcript.partial'; text: string }
  | {
      type: 'transcript.final';
      transcript: string;
      language?: string;
      confidence?: number;
    }
  | {
      type: 'tts.meta';
      sampleRate: number;
      channels: number;
      sampleWidth: number;
      format?: string;
      voice?: string;
      speed?: number;
    }
  | { type: 'tts.audio'; data: string; offset?: number; byteLength?: number }
  | { type: 'tts.done'; byteLength?: number }
  | { type: 'interrupted'; session?: VoiceSessionInfo | null }
  | { type: 'error'; message: string; code?: string }
  | { type: 'pong' }
  | { type: 'open' }
  | { type: 'close'; code?: number; reason?: string }
  | { type: 'reconnect_exhausted'; attempts: number };

type Handler = (event: VoiceSocketEvent) => void;

const MAX_RECONNECT_ATTEMPTS = 8;
const RECONNECT_BASE_MS = 400;
const RECONNECT_MAX_MS = 10_000;
const PING_INTERVAL_MS = 20_000;

function voiceWsUrl(token: string, sessionId?: string | null): string | null {
  const httpBase = getApiBaseUrl().replace(/\/$/, '');
  // http(s)://host[:port]/api → ws(s)://host[:port]/api/voice/ws
  const wsBase = httpBase.replace(/^http/, 'ws');
  const base = safeUrl(wsBase);
  if (!base) return null;

  // Keep the API path prefix (/api); absolute "/voice/ws" would drop it.
  const path = `${base.pathname.replace(/\/$/, '')}/voice/ws`;
  const wsUrl = new URL(path, base);
  wsUrl.searchParams.set('token', token);
  if (sessionId) wsUrl.searchParams.set('sessionId', sessionId);
  return wsUrl.toString();
}

export class VoiceSocket {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private closed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private sessionId: string | null = null;
  private intentionalClose = false;
  private reconnectAttempts = 0;

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  on(handler: Handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(event: VoiceSocketEvent) {
    for (const h of this.handlers) {
      try {
        h(event);
      } catch {
        /* ignore handler errors */
      }
    }
  }

  async connect(sessionId?: string | null) {
    this.closed = false;
    this.intentionalClose = false;
    this.sessionId = sessionId || null;

    const token = await getAccessToken();
    if (this.closed) return;

    await this.openSocket(token, this.sessionId);
  }

  private openSocket(token: string, sessionId: string | null) {
    return new Promise<void>((resolve, reject) => {
      if (this.ws) {
        try {
          this.ws.onopen = null;
          this.ws.onmessage = null;
          this.ws.onerror = null;
          this.ws.onclose = null;
          this.ws.close();
        } catch {
          /* noop */
        }
        this.ws = null;
      }

      const wsHref = voiceWsUrl(token, sessionId);
      if (!wsHref) {
        reject(new Error('Voice WebSocket URL is not configured'));
        return;
      }
      const ws = new WebSocket(wsHref);
      this.ws = ws;

      const onOpen = () => {
        cleanup();
        this.reconnectAttempts = 0;
        this.startPing();
        this.emit({ type: 'open' });
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('Voice WebSocket connection failed'));
      };
      const cleanup = () => {
        ws.removeEventListener('open', onOpen);
        ws.removeEventListener('error', onError);
      };

      ws.addEventListener('open', onOpen);
      ws.addEventListener('error', onError);

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as VoiceSocketEvent;
          this.emit(msg);
        } catch {
          /* ignore malformed */
        }
      };

      ws.onclose = (ev) => {
        this.stopPing();
        this.ws = null;
        this.emit({ type: 'close', code: ev.code, reason: ev.reason });
        if (!this.intentionalClose && !this.closed && this.sessionId) {
          this.scheduleReconnect();
        }
      };
    });
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.connected) this.ping();
    }, PING_INTERVAL_MS);
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.emit({
        type: 'reconnect_exhausted',
        attempts: this.reconnectAttempts,
      });
      this.emit({
        type: 'error',
        message: 'Voice connection lost. Streaming mic may be unavailable — HTTP fallback still works.',
        code: 'WS_RECONNECT_EXHAUSTED',
      });
      return;
    }

    const attempt = this.reconnectAttempts;
    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * Math.pow(2, attempt) + Math.floor(Math.random() * 200)
    );
    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.closed || this.intentionalClose) return;
      void this.connect(this.sessionId).catch(() => {
        // connect() failure also triggers onclose → another scheduleReconnect
        if (!this.closed && !this.intentionalClose && this.sessionId) {
          this.scheduleReconnect();
        }
      });
    }, delay);
  }

  send(type: string, payload: Record<string, unknown> = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify({ type, ...payload }));
      return true;
    } catch {
      return false;
    }
  }

  bind(sessionId: string) {
    this.sessionId = sessionId;
    return this.send('bind', { sessionId });
  }

  updateConfig(patch: Record<string, unknown>) {
    return this.send('config', patch);
  }

  startAudio(mimeType = 'audio/webm', language = 'auto') {
    return this.send('audio.start', { mimeType, language });
  }

  /** Stream a recorded audio chunk (base64). */
  sendAudioChunk(base64: string, partial?: string) {
    return this.send('audio.chunk', {
      data: base64,
      ...(partial ? { partial } : {}),
    });
  }

  /** Send raw binary audio (WebM/PCM frames). */
  sendBinary(buffer: ArrayBuffer) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(buffer);
      return true;
    } catch {
      return false;
    }
  }

  endAudio(options: { data?: string; mimeType?: string; language?: string } = {}) {
    return this.send('audio.end', options);
  }

  speak(text: string, options: { voice?: string; speed?: number } = {}) {
    return this.send('tts', { text, ...options });
  }

  interrupt() {
    return this.send('interrupt');
  }

  ping() {
    return this.send('ping');
  }

  close() {
    this.intentionalClose = true;
    this.closed = true;
    this.reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPing();
    this.send('close');
    try {
      this.ws?.close(1000, 'client hangup');
    } catch {
      /* noop */
    }
    this.ws = null;
    this.handlers.clear();
  }
}

/**
 * Encode a Blob to base64 (chunk-friendly).
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
