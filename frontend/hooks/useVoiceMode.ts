'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Message } from '@/lib/types';
import {
  createVoiceSession,
  endVoiceSession,
  interruptVoiceSession,
  patchVoiceSession,
  transcribeAudioBlob,
} from '@/lib/voice/api';
import {
  extractSpeakableChunks,
  stripMarkdownForSpeech,
} from '@/lib/voice/audioPlayback';
import { createSttSession } from '@/lib/voice/stt/provider';
import {
  isSpeechRecognitionSupported,
  isDuplicateTranscript,
  type SpeechRecognitionController,
} from '@/lib/voice/speechRecognition';
import {
  VoiceActivityDetector,
  WaveformSampler,
  ensureEchoCancellation,
} from '@/lib/voice/vad';
import {
  checkMicrophoneSupport,
  classifyMicrophoneError,
  createVoiceMediaRecorder,
  refineDeniedReason,
  requestMicrophoneStream,
  stopMediaStream,
  type MicFailureReason,
} from '@/lib/voice/microphone';
import { VoiceSocket, blobToBase64 } from '@/lib/voice/VoiceSocket';
import { voiceEngineLog } from '@/lib/voice/voiceEngineLog';
import { getVoiceRuntime, resetVoiceRuntime } from '@/lib/voice/runtime/VoiceRuntime';
import { getUserFriendlyError, toUserFacingError } from '@/lib/userFacingError';
import {
  DEFAULT_VOICE_SETTINGS,
  FALLBACK_VOICES,
  type VoiceMode,
  type VoiceOption,
  type VoicePhase,
  type VoicePresentation,
  type VoiceSettings,
  type VoiceTurn,
} from '@/lib/voice/types';

export interface UseVoiceModeOptions {
  chatId?: string | null;
  projectId?: string | null;
  messages: Message[];
  isChatLoading: boolean;
  sendMessage: (
    text: string,
    attachments?: undefined,
    options?: { voiceMode?: boolean }
  ) => void | Promise<void>;
  stopGenerating: () => void;
}

const WAVEFORM_BARS = 28;
const IDLE_LEVELS: number[] = Array(WAVEFORM_BARS).fill(0.08);
const LEVELS_EPSILON = 0.02;

function formatTimer(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, '0');
  const s = (totalSec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function levelsEqual(a: number[], b: number[], epsilon = LEVELS_EPSILON): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > epsilon) return false;
  }
  return true;
}

function isNativeTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function isNativeTtsPlaying(): boolean {
  if (!isNativeTtsSupported()) return false;
  return window.speechSynthesis.speaking || window.speechSynthesis.pending;
}

function nativeTtsLang(language: VoiceSettings['language']): string {
  if (language === 'hi') return 'hi-IN';
  if (language === 'hi-en') return 'en-IN';
  return 'en-US';
}

function pickNativeVoice(lang: string): SpeechSynthesisVoice | null {
  if (!isNativeTtsSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const prefix = lang.slice(0, 2).toLowerCase();
  const matching = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  const pool = matching.length ? matching : voices;
  return pool.find((v) => v.default) || pool[0] || null;
}

export function useVoiceMode({
  chatId,
  projectId,
  messages,
  isChatLoading,
  sendMessage,
  stopGenerating,
}: UseVoiceModeOptions) {
  const [isLive, setIsLive] = useState(false);
  const [presentation, setPresentation] = useState<VoicePresentation>('expanded');
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [settings, setSettings] = useState<VoiceSettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_VOICE_SETTINGS;
    try {
      const voice = localStorage.getItem('vani-default-voice');
      return voice ? { ...DEFAULT_VOICE_SETTINGS, voice } : DEFAULT_VOICE_SETTINGS;
    } catch {
      return DEFAULT_VOICE_SETTINGS;
    }
  });
  const [voices, setVoices] = useState<VoiceOption[]>(FALLBACK_VOICES);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [levels, setLevels] = useState<number[]>(() => IDLE_LEVELS.slice());
  const [error, setError] = useState<string | null>(null);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [micFailureReason, setMicFailureReason] =
    useState<MicFailureReason>('denied');
  const [micRequesting, setMicRequesting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(DEFAULT_VOICE_SETTINGS.speakerOn);
  const [volume, setVolume] = useState(DEFAULT_VOICE_SETTINGS.volume);
  const [outputLevel, setOutputLevel] = useState(0);
  const [elapsedLabel, setElapsedLabel] = useState('00:00');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const settingsRef = useRef(settings);
  const phaseRef = useRef<VoicePhase>(phase);
  const mutedRef = useRef(muted);
  const speakerOnRef = useRef(speakerOn);
  const isLiveRef = useRef(isLive);
  const presentationRef = useRef(presentation);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const vadRef = useRef<VoiceActivityDetector | null>(null);
  const waveformRef = useRef<WaveformSampler | null>(null);
  const recognitionRef = useRef<SpeechRecognitionController | null>(null);
  const voiceSocketRef = useRef<VoiceSocket | null>(null);
  const spokenOffsetRef = useRef(0);
  const speakBufferRef = useRef('');
  const lastAssistantIdRef = useRef<string | null>(null);
  /** Assistant message id we already spoke (exactly once). */
  const runtimeRef = useRef(getVoiceRuntime());
  const engineRef = useRef(runtimeRef.current.lifecycle);
  const listenCycleIdRef = useRef(0);
  const sendCommittedUtteranceRef = useRef<(text: string) => Promise<void>>(
    async () => undefined
  );
  const spokenAssistantIdRef = useRef<string | null>(null);
  /** Last committed user utterance — legacy guard synced with engine. */
  const lastSubmittedTranscriptRef = useRef<{ text: string; at: number }>({
    text: '',
    at: 0,
  });
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pushToTalkActiveRef = useRef(false);
  const partialTranscriptRef = useRef('');
  const finalTranscriptRef = useRef('');
  const startListeningInternalRef = useRef<() => Promise<void>>(async () => undefined);
  /** Bumps whenever the mic pipeline is torn down — invalidates in-flight starts. */
  const listenGenerationRef = useRef(0);
  /** True while startListeningInternal is awaiting getUserMedia / pipeline setup. */
  const listenStartingRef = useRef(false);
  /** Prevents openVoiceMode from overlapping session creates / intervals. */
  const openingRef = useRef(false);
  /** Latest waveform bars — high-frequency source of truth; React state is gated. */
  const levelsRef = useRef<number[]>(IDLE_LEVELS.slice());
  const sendMessageRef = useRef(sendMessage);
  const stopGeneratingRef = useRef(stopGenerating);
  const mountedRef = useRef(true);
  const speakGenerationRef = useRef(0);
  const messagesRef = useRef(messages);
  const nativeTtsPendingRef = useRef(0);
  const nativeTtsSpeakingRef = useRef(false);
  const nativeTtsEpochRef = useRef(0);
  const nativeTtsKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tryFinishNativeSpeakRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  useEffect(() => {
    speakerOnRef.current = speakerOn;
  }, [speakerOn]);
  useEffect(() => {
    isLiveRef.current = isLive;
  }, [isLive]);
  useEffect(() => {
    presentationRef.current = presentation;
  }, [presentation]);
  useEffect(() => {
    partialTranscriptRef.current = partialTranscript;
  }, [partialTranscript]);
  useEffect(() => {
    finalTranscriptRef.current = finalTranscript;
  }, [finalTranscript]);
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);
  useEffect(() => {
    stopGeneratingRef.current = stopGenerating;
  }, [stopGenerating]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Mirror VoiceEngine state → React phase (single source of truth).
  useEffect(() => {
    const engine = engineRef.current;
    const phaseFromEngine = (state: ReturnType<typeof engine.getState>): VoicePhase => {
      switch (state) {
        case 'listening':
          return 'listening';
        case 'thinking':
          return 'processing';
        case 'speaking':
          return 'speaking';
        case 'muted':
          return 'muted';
        case 'error':
          return 'error';
        default:
          return 'idle';
      }
    };
    return engine.onStateChange((state) => {
      // Phase must always mirror lifecycle state.
      // `isLiveRef` can temporarily diverge from lifecycle transitions during teardown/reconnect,
      // which would otherwise leave the UI stuck at the last manual phase (e.g. "connecting").
      if (!mountedRef.current) return;
      setPhase(phaseFromEngine(state));
    });
  }, []);

  const scheduleReturnToListening = useCallback(() => {
    engineRef.current.scheduleReturnToListening(() => {
      if (
        isLiveRef.current &&
        !mutedRef.current &&
        settingsRef.current.mode === 'hands-free' &&
        !isNativeTtsPlaying()
      ) {
        void startListeningInternalRef.current();
      } else if (mountedRef.current && settingsRef.current.mode !== 'hands-free') {
        setPhase('idle');
      }
    });
  }, []);

  const publishLevels = useCallback((next: number[]) => {
    if (!mountedRef.current || !isLiveRef.current) return;
    if (levelsEqual(levelsRef.current, next)) return;
    levelsRef.current = next;
    setLevels(next);
  }, []);

  const resetLevels = useCallback(() => {
    levelsRef.current = IDLE_LEVELS.slice();
    setLevels((prev) => (levelsEqual(prev, IDLE_LEVELS) ? prev : IDLE_LEVELS.slice()));
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    engineRef.current.clearListenRestart();
  }, []);

  const clearMediaRecorder = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (!recorder) return;

    const tagged = recorder as MediaRecorder & {
      __vaniOnData?: (e: BlobEvent) => void;
    };
    if (tagged.__vaniOnData) {
      recorder.removeEventListener('dataavailable', tagged.__vaniOnData);
      delete tagged.__vaniOnData;
    }
    recorder.ondataavailable = null;
    recorder.onerror = null;
    recorder.onstop = null;

    if (recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* noop */
      }
    }
  }, []);

  const stopMicPipeline = useCallback(() => {
    // Invalidate any in-flight startListeningInternal work.
    listenGenerationRef.current += 1;
    listenStartingRef.current = false;

    recognitionRef.current?.abort();
    recognitionRef.current = null;

    vadRef.current?.stop();
    vadRef.current = null;

    waveformRef.current?.stop();
    waveformRef.current = null;

    clearMediaRecorder();

    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
  }, [clearMediaRecorder]);

  const stopNativeTtsKeepAlive = useCallback(() => {
    if (nativeTtsKeepAliveRef.current) {
      clearInterval(nativeTtsKeepAliveRef.current);
      nativeTtsKeepAliveRef.current = null;
    }
  }, []);

  const startNativeTtsKeepAlive = useCallback(() => {
    if (nativeTtsKeepAliveRef.current) return;
    nativeTtsKeepAliveRef.current = setInterval(() => {
      if (!isNativeTtsSupported() || !window.speechSynthesis.speaking) return;
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }, 12_000);
  }, []);

  const cancelNativeTts = useCallback(() => {
    nativeTtsEpochRef.current += 1;
    nativeTtsPendingRef.current = 0;
    nativeTtsSpeakingRef.current = false;
    stopNativeTtsKeepAlive();
    if (isNativeTtsSupported()) {
      window.speechSynthesis.cancel();
    }
    if (mountedRef.current) setOutputLevel(0);
  }, [stopNativeTtsKeepAlive]);

  const stopSpeaking = useCallback(() => {
    engineRef.current.invalidateSpeak();
    speakGenerationRef.current = engineRef.current.getSpeakGeneration();
    cancelNativeTts();
  }, [cancelNativeTts]);

  const releasePlayback = useCallback(async () => {
    stopSpeaking();
  }, [stopSpeaking]);

  const closeVoiceSocket = useCallback(() => {
    const sock = voiceSocketRef.current;
    voiceSocketRef.current = null;
    sock?.close();
    if (mountedRef.current) setSocketConnected(false);
  }, []);

  const endSessionIfAny = useCallback(async () => {
    const id = sessionIdRef.current;
    sessionIdRef.current = null;
    if (mountedRef.current) setSessionId(null);
    if (id) await endVoiceSession(id);
  }, []);

  const resetVoiceUiState = useCallback(() => {
    spokenOffsetRef.current = 0;
    speakBufferRef.current = '';
    lastAssistantIdRef.current = null;
    spokenAssistantIdRef.current = null;
    lastSubmittedTranscriptRef.current = { text: '', at: 0 };
    pushToTalkActiveRef.current = false;
    speakGenerationRef.current += 1;
    engineRef.current.resetSession();
    runtimeRef.current.bus.reset();
    if (!mountedRef.current) return;
    setPartialTranscript('');
    setFinalTranscript('');
    setTurns([]);
    resetLevels();
    setPhase('idle');
    setMuted(false);
    setOutputLevel(0);
    setElapsedLabel('00:00');
  }, [resetLevels]);

  const cleanup = useCallback(async () => {
    clearTimers();
    stopMicPipeline();
    closeVoiceSocket();
    await releasePlayback();
    await endSessionIfAny();
    resetVoiceUiState();
    resetVoiceRuntime();
    runtimeRef.current = getVoiceRuntime();
    engineRef.current = runtimeRef.current.lifecycle;
  }, [
    clearTimers,
    stopMicPipeline,
    closeVoiceSocket,
    releasePlayback,
    endSessionIfAny,
    resetVoiceUiState,
  ]);

  // Resource teardown on unmount (StrictMode-safe: no setState after unmount).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimers();
      stopMicPipeline();
      voiceSocketRef.current?.close();
      voiceSocketRef.current = null;
      if (isNativeTtsSupported()) window.speechSynthesis.cancel();
      nativeTtsPendingRef.current = 0;
      nativeTtsSpeakingRef.current = false;
      if (nativeTtsKeepAliveRef.current) {
        clearInterval(nativeTtsKeepAliveRef.current);
        nativeTtsKeepAliveRef.current = null;
      }
      const id = sessionIdRef.current;
      sessionIdRef.current = null;
      if (id) void endVoiceSession(id);
    };
  }, [clearTimers, stopMicPipeline]);

  // Single elapsed-time interval for the live voice session.
  useEffect(() => {
    if (!isLive) return;

    startedAtRef.current = Date.now();
    queueMicrotask(() => setElapsedLabel('00:00'));

    const id = setInterval(() => {
      if (!mountedRef.current || !isLiveRef.current) return;
      const next = formatTimer(Date.now() - startedAtRef.current);
      setElapsedLabel((prev) => (prev === next ? prev : next));
    }, 1000);

    timerRef.current = id;
    return () => {
      clearInterval(id);
      if (timerRef.current === id) timerRef.current = null;
    };
  }, [isLive]);

  useEffect(() => {
    if (!isLive || !isNativeTtsSupported()) return;
    const synth = window.speechSynthesis;
    const warm = () => {
      synth.getVoices();
    };
    warm();
    synth.addEventListener?.('voiceschanged', warm);
    synth.onvoiceschanged = warm;
    return () => {
      synth.removeEventListener?.('voiceschanged', warm);
      if (synth.onvoiceschanged === warm) synth.onvoiceschanged = null;
    };
  }, [isLive]);

  const displayElapsedLabel = isLive ? elapsedLabel : '00:00';

  /**
   * Complete native speak only when queued utterances, speak buffer, and the
   * assistant stream have all drained — avoids restarting the mic between
   * sentence chunks or while tokens are still arriving.
   */
  const tryFinishNativeSpeak = useCallback(() => {
    if (!isLiveRef.current || mutedRef.current) return;
    if (engineRef.current.getState() !== 'speaking') return;
    if (nativeTtsPendingRef.current > 0 || isNativeTtsPlaying()) return;

    const last = messagesRef.current[messagesRef.current.length - 1];
    if (last?.role === 'assistant' && last.isStreaming) return;
    if (speakBufferRef.current.trim()) return;

    voiceEngineLog('finished', 'native playback idle');
    engineRef.current.onSpeakComplete(engineRef.current.getSpeakGeneration());
    scheduleReturnToListening();
  }, [scheduleReturnToListening]);

  useEffect(() => {
    tryFinishNativeSpeakRef.current = tryFinishNativeSpeak;
  }, [tryFinishNativeSpeak]);

  /** Queue a chunk on the browser Speech Synthesis API (no network TTS). */
  const speakTextNative = useCallback(
    (text: string, generation?: number) => {
      const clean = text.trim();
      if (!clean || !speakerOnRef.current) return;
      if (
        generation != null &&
        generation !== engineRef.current.getSpeakGeneration()
      ) {
        return;
      }
      if (!isLiveRef.current || mutedRef.current) return;

      if (!isNativeTtsSupported()) {
        voiceEngineLog('error', 'Speech synthesis is not supported in this browser');
        return;
      }

      const utterance = new SpeechSynthesisUtterance(clean);
      const { speed, volume, language } = settingsRef.current;
      utterance.lang = nativeTtsLang(language);
      utterance.rate = Math.min(2, Math.max(0.5, speed || 1));
      utterance.volume = Math.min(1, Math.max(0, volume));
      const voice = pickNativeVoice(utterance.lang);
      if (voice) utterance.voice = voice;

      nativeTtsPendingRef.current += 1;
      const epoch = nativeTtsEpochRef.current;
      voiceEngineLog('debug', 'tts via speechSynthesis', { chars: clean.length });

      const onSettled = () => {
        if (epoch !== nativeTtsEpochRef.current) return;
        if (
          generation != null &&
          generation !== engineRef.current.getSpeakGeneration()
        ) {
          return;
        }
        nativeTtsPendingRef.current = Math.max(0, nativeTtsPendingRef.current - 1);
        if (nativeTtsPendingRef.current === 0) {
          nativeTtsSpeakingRef.current = false;
          stopNativeTtsKeepAlive();
          if (mountedRef.current) setOutputLevel(0);
          tryFinishNativeSpeakRef.current();
        }
      };

      utterance.onstart = () => {
        if (epoch !== nativeTtsEpochRef.current) return;
        if (
          generation != null &&
          generation !== engineRef.current.getSpeakGeneration()
        ) {
          return;
        }
        nativeTtsSpeakingRef.current = true;
        startNativeTtsKeepAlive();
        if (mountedRef.current && isLiveRef.current) {
          setOutputLevel(0.55);
          voiceEngineLog('speaking', 'native playback started');
        }
      };
      utterance.onend = onSettled;
      utterance.onerror = onSettled;

      window.speechSynthesis.speak(utterance);
    },
    [startNativeTtsKeepAlive, stopNativeTtsKeepAlive]
  );

  /**
   * Speak the full assistant reply exactly once (fallback when mid-stream
   * chunking produced nothing).
   */
  const speakAssistantOnce = useCallback(
    (assistantId: string, text: string) => {
      const stripped = stripMarkdownForSpeech(text);
      if (!stripped || mutedRef.current || !isLiveRef.current) {
        engineRef.current.onAssistantReplySkipped(assistantId);
        spokenAssistantIdRef.current = assistantId;
        scheduleReturnToListening();
        return;
      }
      if (!speakerOnRef.current) {
        voiceEngineLog('finished', 'speaker muted — skip TTS');
        engineRef.current.onAssistantReplySkipped(assistantId);
        spokenAssistantIdRef.current = assistantId;
        scheduleReturnToListening();
        return;
      }

      const clean = engineRef.current.tryBeginAssistantSpeak(assistantId, stripped);
      if (!clean) return;
      spokenAssistantIdRef.current = assistantId;

      const generation = engineRef.current.getSpeakGeneration();
      speakGenerationRef.current = generation;
      cancelNativeTts();

      voiceEngineLog('speaking', 'synthesize start', {
        chars: clean.length,
        assistantId,
      });
      speakTextNative(clean, generation);
    },
    [cancelNativeTts, scheduleReturnToListening, speakTextNative]
  );

  // Stream assistant tokens → speakable chunks → native speechSynthesis immediately.
  useEffect(() => {
    if (!isLive) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return;

    const full = (last.content || '').trim();
    if (!full) {
      if (last.isStreaming && lastAssistantIdRef.current !== last.id) {
        lastAssistantIdRef.current = last.id;
        voiceEngineLog('thinking', 'assistant streaming', { id: last.id });
      }
      return;
    }

    if (!last.isStreaming) {
      setTurns((prev) => {
        const idx = prev.findIndex((t) => t.id === `a:${last.id}`);
        if (idx >= 0) {
          if (prev[idx].text === full) return prev;
          return prev.map((t, i) => (i === idx ? { ...t, text: full } : t));
        }
        return [
          ...prev,
          {
            id: `a:${last.id}`,
            role: 'assistant' as const,
            text: full,
            at: new Date().toISOString(),
          },
        ];
      });
    }

    if (
      spokenOffsetRef.current === Number.MAX_SAFE_INTEGER &&
      lastAssistantIdRef.current === last.id
    ) {
      return;
    }

    if (lastAssistantIdRef.current !== last.id) {
      lastAssistantIdRef.current = last.id;
      speakBufferRef.current = '';
      spokenOffsetRef.current = 0;
      spokenAssistantIdRef.current = null;
      cancelNativeTts();
      voiceEngineLog('thinking', 'assistant streaming', { id: last.id });
    }

    if (spokenOffsetRef.current === Number.MAX_SAFE_INTEGER) return;

    const stripped = stripMarkdownForSpeech(full);
    if (!stripped) return;

    if (stripped.length > spokenOffsetRef.current) {
      speakBufferRef.current += stripped.slice(spokenOffsetRef.current);
      spokenOffsetRef.current = stripped.length;
    }

    const { speakable, rest } = extractSpeakableChunks(speakBufferRef.current, {
      force: !last.isStreaming,
      minChars: 8,
    });
    speakBufferRef.current = rest;

    if (speakable.length === 0) {
      if (!last.isStreaming && spokenAssistantIdRef.current !== last.id) {
        speakAssistantOnce(last.id, full);
      }
      return;
    }

    if (mutedRef.current || !speakerOnRef.current) {
      if (!last.isStreaming) {
        engineRef.current.onAssistantReplySkipped(last.id);
        spokenAssistantIdRef.current = last.id;
        scheduleReturnToListening();
      }
      return;
    }

    if (spokenAssistantIdRef.current !== last.id) {
      const began = engineRef.current.tryBeginAssistantSpeak(last.id, stripped);
      if (!began) return;
      spokenAssistantIdRef.current = last.id;
      speakGenerationRef.current = engineRef.current.getSpeakGeneration();
    }

    const generation = engineRef.current.getSpeakGeneration();
    for (const chunk of speakable) {
      speakTextNative(chunk, generation);
    }

    if (!last.isStreaming) {
      tryFinishNativeSpeak();
    }
  }, [
    messages,
    isLive,
    speakAssistantOnce,
    speakTextNative,
    cancelNativeTts,
    scheduleReturnToListening,
    tryFinishNativeSpeak,
  ]);

  /** Send an utterance already committed by VoiceEngine — single network path. */
  const sendCommittedUtterance = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!engineRef.current.tryBeginSend()) {
      voiceEngineLog('debug', 'skip duplicate send for turn');
      return;
    }

    lastSubmittedTranscriptRef.current = { text: trimmed, at: Date.now() };
    spokenOffsetRef.current = 0;
    speakBufferRef.current = '';
    lastAssistantIdRef.current = null;
    spokenAssistantIdRef.current = null;

    setFinalTranscript(trimmed);
    setPartialTranscript('');

    setTurns((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'user' && isDuplicateTranscript(last.text, trimmed)) {
        return prev;
      }
      return [
        ...prev,
        {
          id: `u:${Date.now().toString(36)}`,
          role: 'user' as const,
          text: trimmed,
          at: new Date().toISOString(),
        },
      ];
    });

    recognitionRef.current?.abort();
    recognitionRef.current = null;
    vadRef.current?.stop();
    vadRef.current = null;
    waveformRef.current?.stop();
    waveformRef.current = null;
    listenStartingRef.current = false;

    try {
      if (sessionIdRef.current) {
        await patchVoiceSession(sessionIdRef.current, { state: 'processing' }).catch(
          () => undefined
        );
      }
      await sendMessageRef.current(trimmed, undefined, { voiceMode: true });
      engineRef.current.completeSend(true);
    } catch (err) {
      engineRef.current.onSendFailed();
      setError(
        getUserFriendlyError(err, {
          feature: 'voice',
          fallback: 'Failed to send voice message',
        })
      );
      voiceEngineLog('error', 'sendMessage failed');
      scheduleReturnToListening();
    }
  }, [scheduleReturnToListening]);

  useEffect(() => {
    sendCommittedUtteranceRef.current = sendCommittedUtterance;
  }, [sendCommittedUtterance]);

  const commitAndSend = useCallback(async (text: string, source: string) => {
    const committed = engineRef.current.tryCommitUserUtterance(text, source);
    if (!committed) return;
    await sendCommittedUtteranceRef.current(committed);
  }, []);

  const startMediaRecorder = useCallback((stream: MediaStream) => {
    clearMediaRecorder();
    recordedChunksRef.current = [];
    try {
      const recorder = createVoiceMediaRecorder(stream);
      if (!recorder) {
        mediaRecorderRef.current = null;
        return;
      }
      mediaRecorderRef.current = recorder;

      const sock = voiceSocketRef.current;
      if (sock?.connected) {
        sock.startAudio(
          (recorder.mimeType || 'audio/webm').split(';')[0],
          settingsRef.current.language
        );
      }

      const onDataAvailable = (e: BlobEvent) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
          // Stream chunks over duplex WS while recording (no polling).
          const live = voiceSocketRef.current;
          if (live?.connected && e.data.size > 0) {
            void blobToBase64(e.data)
              .then((b64) => {
                live.sendAudioChunk(b64, partialTranscriptRef.current || undefined);
              })
              .catch(() => {
                /* ignore chunk encode failures */
              });
          }
        }
      };
      recorder.addEventListener('dataavailable', onDataAvailable);
      (recorder as MediaRecorder & { __vaniOnData?: typeof onDataAvailable }).__vaniOnData =
        onDataAvailable;

      // 250ms timeslice — more reliable on Android Chrome than 80ms.
      recorder.start(250);
    } catch (err) {
      console.error('[voice] MediaRecorder start failed', err);
      mediaRecorderRef.current = null;
    }
  }, [clearMediaRecorder]);

  // Replace clearMediaRecorder to also remove addEventListener handlers.
  // (Re-defined below via patch to the earlier clearMediaRecorder — see note.)

  const flushRecorderToStt = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return null;

    const blob = await new Promise<Blob | null>((resolve) => {
      const handleStop = () => {
        recorder.removeEventListener('stop', handleStop);
        const onData = (recorder as MediaRecorder & { __vaniOnData?: (e: BlobEvent) => void })
          .__vaniOnData;
        if (onData) {
          recorder.removeEventListener('dataavailable', onData);
          delete (recorder as MediaRecorder & { __vaniOnData?: unknown }).__vaniOnData;
        }
        recorder.ondataavailable = null;
        recorder.onerror = null;
        recorder.onstop = null;

        const chunks = recordedChunksRef.current;
        recordedChunksRef.current = [];
        if (!chunks.length) {
          resolve(null);
          return;
        }
        resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
      };
      recorder.addEventListener('stop', handleStop);
      try {
        recorder.stop();
      } catch {
        recorder.removeEventListener('stop', handleStop);
        resolve(null);
      }
    });

    mediaRecorderRef.current = null;
    if (!blob || blob.size < 800) return null;

    const sock = voiceSocketRef.current;
    // Prefer duplex WS STT — stream final blob, await transcript.final.
    if (sock?.connected) {
      try {
        const b64 = await blobToBase64(blob);
        const mime = (blob.type || 'audio/webm').split(';')[0];
        const transcript = await new Promise<string | null>((resolve) => {
          const timeout = setTimeout(() => {
            off();
            resolve(null);
          }, 20_000);
          const off = sock.on((ev) => {
            if (ev.type === 'transcript.final') {
              clearTimeout(timeout);
              off();
              resolve(ev.transcript?.trim() || null);
            } else if (ev.type === 'error') {
              clearTimeout(timeout);
              off();
              resolve(null);
            }
          });
          sock.startAudio(mime, settingsRef.current.language);
          sock.endAudio({
            data: b64,
            mimeType: mime,
            language: settingsRef.current.language,
          });
        });
        if (transcript) return transcript;
      } catch {
        // fall through to HTTP
      }
    }

    try {
      const result = await transcribeAudioBlob(blob, {
        sessionId: sessionIdRef.current,
        language: settingsRef.current.language,
      });
      return result.transcript?.trim() || null;
    } catch {
      return null;
    }
  }, []);

  const surfaceMicFailure = useCallback(async (err: unknown) => {
    console.error('[voice] microphone failure', err);
    const reason = await refineDeniedReason(err);
    if (!mountedRef.current) return reason;
    setMicFailureReason(reason);
    setMicPermissionDenied(true);
    setError(null);
    setMicRequesting(false);
    return reason;
  }, []);

  const startListeningInternal = useCallback(async () => {
    if (!isLiveRef.current || mutedRef.current || engineRef.current.isBusy()) return;
    if (isNativeTtsPlaying()) return;
    if (listenStartingRef.current) return;

    listenStartingRef.current = true;
    const generation = ++listenGenerationRef.current;
    const cycleId = engineRef.current.beginListenCycle();
    listenCycleIdRef.current = cycleId;

    setError(null);
    setPartialTranscript('');
    voiceEngineLog('listening', 'mic pipeline starting');

    try {
      if (!mediaStreamRef.current) {
        mediaStreamRef.current = await requestMicrophoneStream();
      } else {
        await ensureEchoCancellation(mediaStreamRef.current);
      }

      if (generation !== listenGenerationRef.current || !isLiveRef.current) {
        return;
      }

      const stream = mediaStreamRef.current;

      // Tear down previous waveform / recognition / VAD before attaching new ones.
      waveformRef.current?.stop();
      waveformRef.current = null;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      vadRef.current?.stop();
      vadRef.current = null;

      waveformRef.current = new WaveformSampler(WAVEFORM_BARS, (next) => {
        publishLevels(next);
      });
      await waveformRef.current.start(stream);

      if (generation !== listenGenerationRef.current || !isLiveRef.current) {
        waveformRef.current?.stop();
        waveformRef.current = null;
        return;
      }

      // Backend STT recorder always runs as a reliability fallback when supported.
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        startMediaRecorder(stream);
      }

      if (generation !== listenGenerationRef.current || !isLiveRef.current) {
        return;
      }

      const useBrowserStt = isSpeechRecognitionSupported();

      if (useBrowserStt) {
        // STT provider abstraction (browser SpeechRecognition today; Deepgram/Whisper later).
        recognitionRef.current = createSttSession({
          language: settingsRef.current.language,
          onPartial: (text) => {
            // Replace partial in place — never append to turns/history.
            if (phaseRef.current === 'listening' && mountedRef.current) {
              setPartialTranscript(text);
              if (!text) return;
              // Keep finalTranscript as last committed only; live line uses partial.
            }
          },
          onFinal: (text) => {
            if (!text.trim()) return;
            if (mountedRef.current) {
              setFinalTranscript(text.trim());
              setPartialTranscript('');
            }
            if (settingsRef.current.mode === 'hands-free') {
              const committed = engineRef.current.onRecognitionFinal(text);
              if (committed) void sendCommittedUtteranceRef.current(committed);
            }
          },
          onError: (err) => {
            if (err === 'not-allowed' && mountedRef.current) {
              void surfaceMicFailure(err).then(() => {
                // Fall back to text — tear down live session without crashing.
                isLiveRef.current = false;
                engineRef.current.setLive(false);
                setIsLive(false);
                setPhase('idle');
              });
            }
          },
        });
        const recognition = recognitionRef.current;
        if (recognition) {
          try {
            recognition.resetUtteranceState();
            recognition.start();
          } catch (startErr) {
            console.error('[voice] SpeechRecognition.start failed', startErr);
            recognitionRef.current = null;
          }
        }
      }

      // VAD: end-of-speech signal. Must NOT double-submit when browser STT already did.
      if (settingsRef.current.mode === 'hands-free' || !useBrowserStt) {
        vadRef.current = new VoiceActivityDetector({
          silenceMs: 700,
          minSpeechMs: 300,
          threshold: 0.016,
          startFrames: 3,
          onSpeechEnd: () => {
            if (settingsRef.current.mode !== 'hands-free') return;
            if (engineRef.current.isBusy()) return;
            const activeCycle = listenCycleIdRef.current;
            void (async () => {
              try {
                const committed = await engineRef.current.requestListenFinalize(
                  activeCycle,
                  async () => {
                    recognitionRef.current?.stop();
                    await new Promise((r) => setTimeout(r, 320));
                    if (activeCycle !== listenCycleIdRef.current) return null;

                    const local =
                      finalTranscriptRef.current.trim() ||
                      partialTranscriptRef.current.trim() ||
                      '';
                    if (local) {
                      return local;
                    }
                    return await flushRecorderToStt();
                  }
                );
                if (committed) {
                  await sendCommittedUtteranceRef.current(committed);
                  return;
                }
                if (
                  isLiveRef.current &&
                  !mutedRef.current &&
                  !engineRef.current.isBusy() &&
                  engineRef.current.getState() === 'listening'
                ) {
                  void startListeningInternalRef.current().catch(() => undefined);
                }
              } catch (vadErr) {
                console.error('[voice] VAD finalize failed', vadErr);
              }
            })();
          },
        });
        await vadRef.current.start(stream);
      }

      if (generation !== listenGenerationRef.current || !isLiveRef.current) {
        vadRef.current?.stop();
        vadRef.current = null;
        recognitionRef.current?.abort();
        recognitionRef.current = null;
        waveformRef.current?.stop();
        waveformRef.current = null;
        return;
      }

      if (sessionIdRef.current) {
        void patchVoiceSession(sessionIdRef.current, { state: 'listening' }).catch(
          () => undefined
        );
      }
    } catch (err) {
      if (generation === listenGenerationRef.current && mountedRef.current) {
        const reason = classifyMicrophoneError(err);
        const isMicIssue =
          reason === 'denied' ||
          reason === 'blocked' ||
          reason === 'unavailable' ||
          reason === 'unsupported' ||
          reason === 'insecure' ||
          reason === 'allow';
        if (isMicIssue) {
          await surfaceMicFailure(err);
          // Fall back to text chat — tear down live session without crashing.
          isLiveRef.current = false;
          engineRef.current.setLive(false);
          setIsLive(false);
          setPhase('idle');
          stopMediaStream(mediaStreamRef.current);
          mediaStreamRef.current = null;
        } else {
          console.error('[voice] listen pipeline failed', err);
          setError("Couldn't start listening. Tap the mic to try again.");
          setPhase('error');
        }
      }
    } finally {
      if (generation === listenGenerationRef.current) {
        listenStartingRef.current = false;
      }
    }
  }, [flushRecorderToStt, publishLevels, startMediaRecorder, surfaceMicFailure]);

  useEffect(() => {
    startListeningInternalRef.current = startListeningInternal;
  }, [startListeningInternal]);

  const openVoiceMode = useCallback(async () => {
    // Already live — just restore the full Live UI (session keeps running).
    if (isLiveRef.current) {
      setPresentation('expanded');
      presentationRef.current = 'expanded';
      return;
    }
    // Ref guards stop double-open before React re-renders (no duplicate intervals/sessions).
    if (openingRef.current) return;
    openingRef.current = true;

    setMicPermissionDenied(false);
    setError(null);
    setPartialTranscript('');
    setFinalTranscript('');

    // 1) Preflight — HTTPS / getUserMedia support (no prompt yet).
    const support = checkMicrophoneSupport();
    if (!support.ok) {
      setMicFailureReason(support.reason || 'unsupported');
      setMicPermissionDenied(true);
      openingRef.current = false;
      return;
    }

    // 2) Request mic IMMEDIATELY in the user-gesture turn.
    //    Android Chrome / Safari revoke gesture after network awaits.
    //    Reuse an already-live track (e.g. after retry) to avoid a second prompt.
    const existingTrack = mediaStreamRef.current?.getAudioTracks?.()?.[0];
    const canReuseStream =
      !!mediaStreamRef.current &&
      existingTrack &&
      existingTrack.readyState === 'live';

    if (!canReuseStream) {
      setMicRequesting(true);
      try {
        stopMediaStream(mediaStreamRef.current);
        mediaStreamRef.current = null;
        mediaStreamRef.current = await requestMicrophoneStream();
      } catch (err) {
        await surfaceMicFailure(err);
        openingRef.current = false;
        return;
      } finally {
        if (mountedRef.current) setMicRequesting(false);
      }
    }

    if (!mountedRef.current) {
      stopMediaStream(mediaStreamRef.current);
      mediaStreamRef.current = null;
      openingRef.current = false;
      return;
    }

    // 3) Only after mic is granted — enter Live Mode and create session.
    isLiveRef.current = true;
    engineRef.current.setLive(true);
    setIsLive(true);
    setPresentation('expanded');
    presentationRef.current = 'expanded';
    setPhase('connecting');
    setTurns([]);
    resetLevels();

    try {
      try {
        const storedVoice = localStorage.getItem('vani-default-voice');
        if (storedVoice && storedVoice !== settingsRef.current.voice) {
          const next = { ...settingsRef.current, voice: storedVoice };
          settingsRef.current = next;
          setSettings(next);
        }
      } catch {
        /* ignore */
      }

      const { session, voices: serverVoices } = await createVoiceSession({
        chatId,
        projectId,
        mode: settingsRef.current.mode,
        voice: settingsRef.current.voice,
        speed: settingsRef.current.speed,
        language: settingsRef.current.language,
      });

      if (!isLiveRef.current || !mountedRef.current) {
        await endVoiceSession(session.id).catch(() => undefined);
        return;
      }

      sessionIdRef.current = session.id;
      setSessionId(session.id);
      if (serverVoices?.length) setVoices(serverVoices);

      // Open duplex WebSocket for streaming STT (HTTP remains as fallback).
      try {
        const sock = new VoiceSocket();
        voiceSocketRef.current = sock;
        sock.on((ev) => {
          if (ev.type === 'open' || ev.type === 'ready') {
            if (mountedRef.current) setSocketConnected(true);
          } else if (ev.type === 'close') {
            if (mountedRef.current) setSocketConnected(false);
          } else if (ev.type === 'reconnect_exhausted' || ev.type === 'error') {
            if (
              mountedRef.current &&
              (ev.type === 'reconnect_exhausted' ||
                (ev.type === 'error' && ev.code === 'WS_RECONNECT_EXHAUSTED'))
            ) {
              setSocketConnected(false);
              setError(
                toUserFacingError(
                  ev.type === 'error' ? ev.message : null,
                  'Voice connection interrupted. You can keep talking — replies may be slower.'
                )
              );
            }
          } else if (ev.type === 'transcript.partial' && phaseRef.current === 'listening') {
            // Browser STT owns partials when active — ignore WS echo duplicates.
            if (recognitionRef.current) return;
            if (mountedRef.current) setPartialTranscript(ev.text);
          }
        });
        await sock.connect(session.id);
      } catch (wsErr) {
        // WS optional — HTTP STT/TTS still works.
        console.error('[voice] WebSocket connect failed (HTTP fallback)', wsErr);
        voiceSocketRef.current = null;
        if (mountedRef.current) setSocketConnected(false);
      }

      // Hands-free continuous conversation is the Live Mode default.
      settingsRef.current = { ...settingsRef.current, mode: 'hands-free' };
      setSettings((s) => ({ ...s, mode: 'hands-free' }));
      await startListeningInternalRef.current();
    } catch (err) {
      console.error('[voice] openVoiceMode failed', err);
      if (mountedRef.current) {
        setError(
          toUserFacingError(
            err,
            "Couldn't start Voice Mode. Please try again."
          )
        );
        setPhase('error');
        // Keep Live UI so the user can read the error and tap End → text chat.
      }
    } finally {
      openingRef.current = false;
    }
  }, [chatId, projectId, resetLevels, surfaceMicFailure]);

  const dismissMicPermissionDenied = useCallback(() => {
    setMicPermissionDenied(false);
    setMicRequesting(false);
  }, []);

  const retryMicrophone = useCallback(async () => {
    // After user changes browser settings, re-request from a fresh tap.
    setMicPermissionDenied(false);
    setError(null);
    setMicRequesting(true);
    try {
      const support = checkMicrophoneSupport();
      if (!support.ok) {
        setMicFailureReason(support.reason || 'unsupported');
        setMicPermissionDenied(true);
        return;
      }
      stopMediaStream(mediaStreamRef.current);
      mediaStreamRef.current = null;
      mediaStreamRef.current = await requestMicrophoneStream();
      setMicPermissionDenied(false);
      // Mic granted — start (or resume) voice mode.
      if (!isLiveRef.current) {
        setMicRequesting(false);
        await openVoiceMode();
        return;
      }
      setPresentation('expanded');
      presentationRef.current = 'expanded';
      setPhase('connecting');
      await startListeningInternalRef.current();
    } catch (err) {
      await surfaceMicFailure(err);
    } finally {
      if (mountedRef.current) setMicRequesting(false);
    }
  }, [openVoiceMode, surfaceMicFailure]);

  const minimizeVoiceMode = useCallback(() => {
    if (!isLiveRef.current) return;
    setPresentation('minimized');
    presentationRef.current = 'minimized';
    // Mic / TTS / WebSocket keep running — only the full UI collapses.
  }, []);

  const expandVoiceMode = useCallback(() => {
    if (!isLiveRef.current) return;
    setPresentation('expanded');
    presentationRef.current = 'expanded';
  }, []);

  const closeVoiceMode = useCallback(async () => {
    isLiveRef.current = false;
    engineRef.current.setLive(false);
    openingRef.current = false;
    setIsLive(false);
    setPresentation('expanded');
    presentationRef.current = 'expanded';
    stopGeneratingRef.current();
    await cleanup();
    if (mountedRef.current) setTurns([]);
  }, [cleanup]);

  const interrupt = useCallback(async () => {
    voiceEngineLog('debug', 'interrupt');
    engineRef.current.interrupt();
    stopSpeaking();
    stopGeneratingRef.current();
    speakBufferRef.current = '';
    spokenOffsetRef.current = Number.MAX_SAFE_INTEGER;
    if (lastAssistantIdRef.current) {
      engineRef.current.markAssistantHandled(lastAssistantIdRef.current);
      spokenAssistantIdRef.current = lastAssistantIdRef.current;
    }
    const sock = voiceSocketRef.current;
    if (sock?.connected) {
      sock.interrupt();
    } else if (sessionIdRef.current) {
      void interruptVoiceSession(sessionIdRef.current).catch(() => undefined);
    }
    if (settingsRef.current.mode === 'hands-free' && !mutedRef.current) {
      voiceEngineLog('listening', 'restart after interrupt');
      await startListeningInternalRef.current();
    } else if (mountedRef.current) {
      setPhase('idle');
    }
  }, [stopSpeaking]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      if (next) {
        recognitionRef.current?.abort();
        recognitionRef.current = null;
        vadRef.current?.stop();
        vadRef.current = null;
        waveformRef.current?.stop();
        waveformRef.current = null;
        listenStartingRef.current = false;
        stopSpeaking();
        setPhase('muted');
      } else if (settingsRef.current.mode === 'hands-free') {
        void startListeningInternalRef.current();
      } else {
        setPhase('idle');
      }
      voiceSocketRef.current?.updateConfig({
        muted: next,
        state: next ? 'muted' : 'idle',
      });
      if (sessionIdRef.current) {
        void patchVoiceSession(sessionIdRef.current, {
          muted: next,
          state: next ? 'muted' : 'idle',
        });
      }
      return next;
    });
  }, [stopSpeaking]);

  const toggleSpeaker = useCallback(() => {
    setSpeakerOn((prev) => {
      const next = !prev;
      speakerOnRef.current = next;
      settingsRef.current = { ...settingsRef.current, speakerOn: next };
      setSettings((s) => ({ ...s, speakerOn: next }));
      if (!next) stopSpeaking();
      return next;
    });
  }, [stopSpeaking]);

  const setMode = useCallback((mode: VoiceMode) => {
    setSettings((s) => ({ ...s, mode }));
    voiceSocketRef.current?.updateConfig({ mode });
    if (sessionIdRef.current) {
      void patchVoiceSession(sessionIdRef.current, { mode });
    }
    if (!isLiveRef.current) return;
    if (mode === 'hands-free' && !mutedRef.current) {
      void startListeningInternalRef.current();
    } else {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      vadRef.current?.stop();
      vadRef.current = null;
      setPhase('idle');
    }
  }, []);

  const updateSettings = useCallback((patch: Partial<VoiceSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      settingsRef.current = next;
      if (typeof patch.voice === 'string') {
        try {
          localStorage.setItem('vani-default-voice', patch.voice);
        } catch {
          /* ignore */
        }
      }
      if (typeof patch.volume === 'number') {
        setVolume(patch.volume);
      }
      if (typeof patch.speakerOn === 'boolean') {
        speakerOnRef.current = patch.speakerOn;
        setSpeakerOn(patch.speakerOn);
      }
      voiceSocketRef.current?.updateConfig({
        voice: next.voice,
        speed: next.speed,
        language: next.language,
        mode: next.mode,
      });
      if (sessionIdRef.current) {
        void patchVoiceSession(sessionIdRef.current, {
          voice: next.voice,
          speed: next.speed,
          language: next.language,
          mode: next.mode,
        });
      }
      recognitionRef.current?.setLanguage(next.language);
      return next;
    });
    if (patch.speakerOn === false) stopSpeaking();
  }, [stopSpeaking]);

  /** Push-to-talk: press */
  const beginPushToTalk = useCallback(async () => {
    if (settingsRef.current.mode !== 'push-to-talk') return;
    if (mutedRef.current || !isLiveRef.current) return;
    pushToTalkActiveRef.current = true;
    // Interrupt AI if speaking.
    if (phaseRef.current === 'speaking' || isNativeTtsPlaying()) {
      await interrupt();
    }
    setFinalTranscript('');
    await startListeningInternalRef.current();
  }, [interrupt]);

  /** Push-to-talk: release */
  const endPushToTalk = useCallback(async () => {
    if (settingsRef.current.mode !== 'push-to-talk') return;
    if (!pushToTalkActiveRef.current) return;
    pushToTalkActiveRef.current = false;

    recognitionRef.current?.stop();
    vadRef.current?.stop();

    const local = `${finalTranscriptRef.current} ${partialTranscriptRef.current}`.trim();
    const fromServer = await flushRecorderToStt();
    const text = (local || fromServer || '').trim();
    if (text) await commitAndSend(text, 'push-to-talk');
    else setPhase('idle');
  }, [flushRecorderToStt, commitAndSend]);

  // Sync chatId into session when conversation is persisted mid-call.
  useEffect(() => {
    if (!sessionIdRef.current || !chatId) return;
    void patchVoiceSession(sessionIdRef.current, { chatId }).catch(() => undefined);
  }, [chatId]);

  // Allow interrupting by starting to speak while AI talks (hands-free barge-in).
  // Mic stays open with echoCancellation; VAD is heavily desensitized + hold-off
  // so speaker echo / room noise does not abort the in-flight chat fetch.
  useEffect(() => {
    if (!isLive || muted || settings.mode !== 'hands-free') return;
    // Only while TTS is playing — do not arm during "processing"/thinking or
    // ambient noise will interrupt() and abort the active /chat stream.
    if (phase !== 'speaking') return;

    let stopped = false;
    let bargeIn: VoiceActivityDetector | null = null;

    const arm = async () => {
      // Ensure mic + AEC are live before arming barge-in.
      // Never auto-prompt here if permission isn't already granted — barge-in
      // only runs during an active Live session that already obtained the mic.
      if (!mediaStreamRef.current) {
        try {
          mediaStreamRef.current = await requestMicrophoneStream();
        } catch (err) {
          console.error('[voice] barge-in mic unavailable', err);
          return;
        }
      } else {
        await ensureEchoCancellation(mediaStreamRef.current).catch(() => undefined);
      }
      if (stopped || !mediaStreamRef.current) return;

      bargeIn = new VoiceActivityDetector({
        // Much higher than listen VAD — reject speaker echo / keyboard noise.
        threshold: 0.055,
        minSpeechMs: 280,
        startFrames: 10,
        silenceMs: 10_000,
        onSpeechStart: () => {
          if (!stopped) void interrupt().catch(() => undefined);
        },
      });
      try {
        await bargeIn.start(mediaStreamRef.current);
        // Hold off while TTS onset / room echo peaks — real barge-in is sustained.
        bargeIn.ignoreSpeechFor(850);
      } catch (err) {
        console.error('[voice] barge-in VAD failed', err);
        bargeIn.stop();
        bargeIn = null;
      }
    };

    void arm().catch((err) => {
      console.error('[voice] barge-in arm failed', err);
    });
    return () => {
      stopped = true;
      bargeIn?.stop();
    };
  }, [isLive, phase, settings.mode, muted, interrupt]);

  return {
    isLive,
    isExpanded: isLive && presentation === 'expanded',
    isMinimized: isLive && presentation === 'minimized',
    presentation,
    phase,
    settings,
    voices,
    partialTranscript,
    finalTranscript,
    turns,
    levels,
    outputLevel,
    error,
    micPermissionDenied,
    micFailureReason,
    micRequesting,
    muted,
    speakerOn,
    volume,
    elapsedLabel: displayElapsedLabel,
    sessionId,
    socketConnected,
    openVoiceMode,
    retryMicrophone,
    dismissMicPermissionDenied,
    minimizeVoiceMode,
    expandVoiceMode,
    closeVoiceMode,
    interrupt,
    toggleMute,
    toggleSpeaker,
    setMode,
    updateSettings,
    beginPushToTalk,
    endPushToTalk,
    stopSpeaking,
    isSpeechRecognitionSupported: isSpeechRecognitionSupported(),
  };
}
