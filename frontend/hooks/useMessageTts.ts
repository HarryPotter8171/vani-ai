'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TtsState } from '@/components/chat/MessageActions';
import { consumeMp3Response, fetchTtsStream } from '@/lib/tts/client';

/** Split markdown-ish text into speakable paragraphs (highlighting helpers). */
export function splitSpeakableParagraphs(text: string): string[] {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>|-]+/g, ' ')
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0);
}

const CACHE_LIMIT = 24;

type CacheEntry = { blob: Blob };

function normalizeCacheKey(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function waitUntilEnded(
  audio: HTMLAudioElement,
  signal: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    if (audio.ended) {
      resolve();
      return;
    }
    const onEnded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Audio playback failed'));
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const cleanup = () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
    };
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function useMessageTts(options?: {
  onError?: (message: string) => void;
}) {
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [ttsState, setTtsState] = useState<TtsState>('idle');
  const [paragraphIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const ttsStateRef = useRef<TtsState>('idle');
  const messageIdRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const generationRef = useRef(0);
  const onErrorRef = useRef(options?.onError);

  ttsStateRef.current = ttsState;
  onErrorRef.current = options?.onError;

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = 'auto';
    }
    return audioRef.current;
  }, []);

  const rememberCache = useCallback((key: string, blob: Blob) => {
    const cache = cacheRef.current;
    if (cache.has(key)) cache.delete(key);
    cache.set(key, { blob });
    while (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }, []);

  const stopAudioElement = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    revokeObjectUrl();
  }, [revokeObjectUrl]);

  const stop = useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    stopAudioElement();
    messageIdRef.current = null;
    setActiveMessageId(null);
    setError(null);
    setTtsState('idle');
  }, [stopAudioElement]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (ttsStateRef.current !== 'playing') return;
    audio.pause();
    setTtsState('paused');
  }, []);

  const resume = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (ttsStateRef.current !== 'paused') return;
    try {
      await audio.play();
      setTtsState('playing');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to resume playback';
      setError(message);
      setTtsState('error');
      onErrorRef.current?.(message);
    }
  }, []);

  const play = useCallback(
    async (messageId: string, content: string) => {
      if (typeof window === 'undefined') return;

      const text = content.trim();
      if (!text) return;
      const key = normalizeCacheKey(text);

      // Same message: playing → pause, paused → resume, loading → cancel.
      if (messageIdRef.current === messageId) {
        if (ttsStateRef.current === 'playing') {
          pause();
          return;
        }
        if (ttsStateRef.current === 'paused') {
          await resume();
          return;
        }
        if (ttsStateRef.current === 'loading') {
          stop();
          return;
        }
      }

      abortRef.current?.abort();
      stopAudioElement();

      const generation = ++generationRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      messageIdRef.current = messageId;
      setActiveMessageId(messageId);
      setError(null);

      const stillCurrent = () => generationRef.current === generation;

      try {
        const audio = ensureAudio();
        const cached = cacheRef.current.get(key);

        if (cached) {
          setTtsState('playing');
          revokeObjectUrl();
          const url = URL.createObjectURL(cached.blob);
          objectUrlRef.current = url;
          audio.src = url;
          audio.currentTime = 0;
          await audio.play();
          await waitUntilEnded(audio, controller.signal);
          if (stillCurrent()) stop();
          return;
        }

        setTtsState('loading');

        const response = await fetchTtsStream(text, controller.signal);
        if (!stillCurrent()) return;

        revokeObjectUrl();

        const { blob, objectUrl } = await consumeMp3Response(
          response,
          controller.signal,
          {
            audio,
            onReady: () => {
              if (!stillCurrent()) return;
              // Respect an in-flight user pause during first-chunk start.
              if (ttsStateRef.current === 'paused') return;
              setTtsState('playing');
            },
          }
        );

        if (!stillCurrent()) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          return;
        }

        objectUrlRef.current = objectUrl;
        rememberCache(key, blob);

        await waitUntilEnded(audio, controller.signal);
        if (stillCurrent()) stop();
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        if (!stillCurrent()) return;
        const message =
          err instanceof Error ? err.message : 'Speech synthesis failed';
        console.error('[tts]', err);
        stopAudioElement();
        messageIdRef.current = messageId;
        setActiveMessageId(messageId);
        setError(message);
        setTtsState('error');
        onErrorRef.current?.(message);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [
      pause,
      resume,
      stop,
      stopAudioElement,
      ensureAudio,
      revokeObjectUrl,
      rememberCache,
    ]
  );

  useEffect(() => () => stop(), [stop]);

  return {
    activeMessageId,
    ttsState,
    paragraphIndex,
    error,
    play,
    pause,
    resume,
    stop,
  };
}
