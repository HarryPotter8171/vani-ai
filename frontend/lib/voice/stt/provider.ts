/**
 * Speech-to-text provider abstraction.
 * Default: browser Web Speech API.
 * Future: Deepgram / Whisper via backend without changing call sites.
 */

import {
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  type RecognitionLanguage,
  type SpeechRecognitionController,
} from '@/lib/voice/speechRecognition';

export type SttProviderId = 'browser' | 'deepgram' | 'whisper';

export interface SttSessionHandlers {
  onPartial?: (text: string) => void;
  onFinal?: (text: string, confidence: number) => void;
  onError?: (error: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  language?: RecognitionLanguage;
}

export interface SttProvider {
  readonly id: SttProviderId;
  readonly supported: boolean;
  createSession(handlers: SttSessionHandlers): SpeechRecognitionController | null;
}

/** Browser SpeechRecognition — current production default. */
export const browserSttProvider: SttProvider = {
  id: 'browser',
  get supported() {
    return isSpeechRecognitionSupported();
  },
  createSession(handlers) {
    if (!isSpeechRecognitionSupported()) return null;
    return createSpeechRecognition(handlers);
  },
};

/**
 * Placeholder providers for future backend streaming STT.
 * They report unsupported until wired to Deepgram/Whisper endpoints.
 */
export const deepgramSttProvider: SttProvider = {
  id: 'deepgram',
  supported: false,
  createSession() {
    return null;
  },
};

export const whisperSttProvider: SttProvider = {
  id: 'whisper',
  supported: false,
  createSession() {
    return null;
  },
};

const PROVIDERS: Record<SttProviderId, SttProvider> = {
  browser: browserSttProvider,
  deepgram: deepgramSttProvider,
  whisper: whisperSttProvider,
};

/**
 * Resolve the active STT provider.
 * Override with NEXT_PUBLIC_STT_PROVIDER only for non-secret provider selection
 * (never put API keys in NEXT_PUBLIC_*).
 */
export function getSttProvider(preferred?: SttProviderId): SttProvider {
  const fromEnv =
    typeof process !== 'undefined'
      ? (process.env.NEXT_PUBLIC_STT_PROVIDER as SttProviderId | undefined)
      : undefined;
  const id = preferred || fromEnv || 'browser';
  const provider = PROVIDERS[id] || browserSttProvider;
  if (provider.supported) return provider;
  return browserSttProvider;
}

export function createSttSession(
  handlers: SttSessionHandlers,
  preferred?: SttProviderId
): SpeechRecognitionController | null {
  return getSttProvider(preferred).createSession(handlers);
}

export { isSpeechRecognitionSupported };
