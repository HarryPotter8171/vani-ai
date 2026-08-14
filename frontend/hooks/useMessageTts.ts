'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TtsState } from '@/components/chat/MessageActions';

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

function isNativeTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function pickNativeVoice(): SpeechSynthesisVoice | null {
  if (!isNativeTtsSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const pool = english.length ? english : voices;
  return pool.find((v) => v.default) || pool[0] || null;
}

export function useMessageTts(options?: {
  onError?: (message: string) => void;
}) {
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [ttsState, setTtsState] = useState<TtsState>('idle');

  const ttsStateRef = useRef<TtsState>('idle');
  const messageIdRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onErrorRef = useRef(options?.onError);

  ttsStateRef.current = ttsState;
  onErrorRef.current = options?.onError;

  const stopKeepAlive = useCallback(() => {
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
  }, []);

  const startKeepAlive = useCallback(() => {
    if (keepAliveRef.current) return;
    keepAliveRef.current = setInterval(() => {
      if (!isNativeTtsSupported() || !window.speechSynthesis.speaking) return;
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }, 12_000);
  }, []);

  const resetIdle = useCallback(() => {
    stopKeepAlive();
    messageIdRef.current = null;
    setActiveMessageId(null);
    setTtsState('idle');
  }, [stopKeepAlive]);

  const stop = useCallback(() => {
    generationRef.current += 1;
    if (isNativeTtsSupported()) {
      window.speechSynthesis.cancel();
    }
    resetIdle();
  }, [resetIdle]);

  const pause = useCallback(() => {
    if (!isNativeTtsSupported()) return;
    if (ttsStateRef.current !== 'playing') return;
    window.speechSynthesis.pause();
    stopKeepAlive();
    setTtsState('paused');
  }, [stopKeepAlive]);

  const resume = useCallback(() => {
    if (!isNativeTtsSupported()) return;
    if (ttsStateRef.current !== 'paused') return;
    window.speechSynthesis.resume();
    startKeepAlive();
    setTtsState('playing');
  }, [startKeepAlive]);

  const play = useCallback(
    (messageId: string, content: string) => {
      if (typeof window === 'undefined') return;

      const text =
        splitSpeakableParagraphs(content).join(' ').trim() || content.trim();
      if (!text) return;

      // Same message: playing → pause, paused → resume.
      if (messageIdRef.current === messageId) {
        if (ttsStateRef.current === 'playing') {
          pause();
          return;
        }
        if (ttsStateRef.current === 'paused') {
          resume();
          return;
        }
      }

      if (!isNativeTtsSupported()) {
        onErrorRef.current?.(
          'Speech synthesis is not supported in this browser'
        );
        return;
      }

      // Bump generation before cancel so a prior utterance's interrupted
      // onerror cannot clear the new playback.
      const generation = ++generationRef.current;
      window.speechSynthesis.cancel();

      messageIdRef.current = messageId;
      setActiveMessageId(messageId);

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      const voice = pickNativeVoice();
      if (voice) utterance.voice = voice;

      utterance.onstart = () => {
        if (generationRef.current !== generation) return;
        setTtsState('playing');
        startKeepAlive();
      };
      utterance.onend = () => {
        if (generationRef.current !== generation) return;
        resetIdle();
      };
      utterance.onerror = () => {
        if (generationRef.current !== generation) return;
        resetIdle();
      };

      setTtsState('playing');
      window.speechSynthesis.speak(utterance);
    },
    [pause, resume, resetIdle, startKeepAlive]
  );

  useEffect(() => () => stop(), [stop]);

  return {
    activeMessageId,
    ttsState,
    paragraphIndex: -1,
    error: null as string | null,
    play,
    pause,
    resume,
    stop,
  };
}
