/**
 * Streaming speech recognition via the Web Speech API.
 *
 * Guarantees:
 * - At most ONE SpeechRecognition instance in the process.
 * - Partials replace in place (debounced).
 * - Finals are deduped + debounced — never fire twice for the same utterance.
 */

export type RecognitionLanguage = 'auto' | 'en' | 'hi' | 'hi-en';

export interface SpeechRecognitionController {
  supported: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  setLanguage: (lang: RecognitionLanguage) => void;
  /** Clear pending debounce / last-final cache (call when starting a new listen turn). */
  resetUtteranceState: () => void;
}

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string; confidence: number };
  }>;
};

type Handlers = {
  onPartial?: (text: string) => void;
  onFinal?: (text: string, confidence: number) => void;
  onError?: (error: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  language?: RecognitionLanguage;
};

const PARTIAL_DEBOUNCE_MS = 60;
const FINAL_DEDUP_WINDOW_MS = 2500;

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported() {
  return !!getSpeechRecognitionCtor();
}

function mapLanguage(lang: RecognitionLanguage): string {
  switch (lang) {
    case 'hi':
      return 'hi-IN';
    case 'hi-en':
      return 'en-IN';
    case 'en':
      return 'en-IN';
    case 'auto':
    default:
      return 'en-IN';
  }
}

/** Normalize for duplicate detection (case/whitespace/punctuation tolerant). */
export function normalizeTranscript(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isDuplicateTranscript(
  a: string,
  b: string,
  options: { windowMs?: number; aAt?: number; bAt?: number } = {}
): boolean {
  const na = normalizeTranscript(a);
  const nb = normalizeTranscript(b);
  if (!na || !nb) return false;
  if (na === nb) {
    if (options.aAt != null && options.bAt != null && options.windowMs != null) {
      return Math.abs(options.aAt - options.bAt) <= options.windowMs;
    }
    return true;
  }
  // One contains the other (segmented finals vs full utterance).
  if (na.length >= 8 && nb.length >= 8 && (na.includes(nb) || nb.includes(na))) {
    return true;
  }
  return false;
}

// ─── Process-wide singleton ───────────────────────────────────────────────
let sharedRecognition: SpeechRecognitionLike | null = null;
let sharedOwnerId: number | null = null;
let nextOwnerId = 1;
let sharedRunning = false;

function destroySharedRecognition() {
  if (!sharedRecognition) return;
  sharedRecognition.onresult = null;
  sharedRecognition.onerror = null;
  sharedRecognition.onend = null;
  sharedRecognition.onstart = null;
  try {
    sharedRecognition.abort();
  } catch {
    /* noop */
  }
  sharedRecognition = null;
  sharedRunning = false;
  sharedOwnerId = null;
}

/**
 * Create (or reclaim) the single shared SpeechRecognition controller.
 * Calling this while another controller is active aborts the previous owner.
 */
export function createSpeechRecognition(handlers: Handlers): SpeechRecognitionController {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    return {
      supported: false,
      start: () => handlers.onError?.('unsupported'),
      stop: () => undefined,
      abort: () => undefined,
      setLanguage: () => undefined,
      resetUtteranceState: () => undefined,
    };
  }

  const ownerId = nextOwnerId++;
  // Reclaim any prior instance — only one owner may listen.
  if (sharedRecognition && sharedOwnerId !== ownerId) {
    destroySharedRecognition();
  }
  sharedOwnerId = ownerId;

  let lang: RecognitionLanguage = handlers.language || 'auto';
  let intentionalStop = false;

  let partialTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingPartial = '';
  let pendingFinal = '';
  let pendingConfidence = 0;
  let lastEmittedFinal = '';
  let lastEmittedFinalAt = 0;
  /** Accumulate continuous finals into one utterance until stop/submit. */
  let utteranceFinalParts: string[] = [];
  /** Prevents stop() + onend from emitting the same final twice. */
  let finalFlushedThisCycle = false;

  const clearTimers = () => {
    if (partialTimer) {
      clearTimeout(partialTimer);
      partialTimer = null;
    }
  };

  const resetUtteranceState = () => {
    clearTimers();
    pendingPartial = '';
    pendingFinal = '';
    pendingConfidence = 0;
    utteranceFinalParts = [];
    finalFlushedThisCycle = false;
  };

  const emitFinal = (text: string, confidence: number) => {
    const trimmed = text.trim();
    if (!trimmed || finalFlushedThisCycle) return;
    const now = Date.now();
    if (
      isDuplicateTranscript(trimmed, lastEmittedFinal, {
        aAt: now,
        bAt: lastEmittedFinalAt,
        windowMs: FINAL_DEDUP_WINDOW_MS,
      })
    ) {
      return;
    }
    finalFlushedThisCycle = true;
    lastEmittedFinal = trimmed;
    lastEmittedFinalAt = now;
    utteranceFinalParts = [];
    pendingFinal = '';
    handlers.onFinal?.(trimmed, confidence);
  };

  const flushPendingFinal = () => {
    if (finalFlushedThisCycle) return;
    const joined = (pendingFinal || utteranceFinalParts.join(' ')).trim();
    if (!joined) return;
    emitFinal(joined, pendingConfidence || 0.8);
  };

  const ensure = () => {
    if (sharedRecognition && sharedOwnerId === ownerId) return sharedRecognition;

    destroySharedRecognition();
    sharedOwnerId = ownerId;
    const recognition = new Ctor();
    sharedRecognition = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = mapLanguage(lang);

    recognition.onstart = () => {
      if (sharedOwnerId !== ownerId) return;
      sharedRunning = true;
      handlers.onStart?.();
    };

    recognition.onresult = (event) => {
      if (sharedOwnerId !== ownerId) return;

      let interim = '';
      let finalChunk = '';
      let confidence = 0;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const piece = (result[0]?.transcript || '').trim();
        if (!piece) continue;
        if (result.isFinal) {
          finalChunk = finalChunk ? `${finalChunk} ${piece}` : piece;
          confidence = result[0]?.confidence ?? 0.8;
        } else {
          interim = interim ? `${interim} ${piece}` : piece;
        }
      }

      if (interim) {
        pendingPartial = interim;
        if (partialTimer) clearTimeout(partialTimer);
        partialTimer = setTimeout(() => {
          partialTimer = null;
          if (sharedOwnerId !== ownerId) return;
          handlers.onPartial?.(pendingPartial.trim());
        }, PARTIAL_DEBOUNCE_MS);
      }

      if (finalChunk) {
        // Continuous mode yields segment finals — merge until stop/onend flushes ONE utterance.
        const nextPart = finalChunk.trim();
        const lastPart = utteranceFinalParts[utteranceFinalParts.length - 1];
        if (!lastPart || !isDuplicateTranscript(nextPart, lastPart)) {
          utteranceFinalParts.push(nextPart);
        }
        pendingFinal = utteranceFinalParts.join(' ').trim();
        pendingConfidence = confidence || pendingConfidence;
        pendingPartial = '';
        if (partialTimer) {
          clearTimeout(partialTimer);
          partialTimer = null;
        }
        // Show accumulating finals as the live line (still not a committed turn).
        if (pendingFinal) handlers.onPartial?.(pendingFinal);
      }
    };

    recognition.onerror = (event) => {
      if (sharedOwnerId !== ownerId) return;
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      handlers.onError?.(event.error);
    };

    recognition.onend = () => {
      if (sharedOwnerId !== ownerId) return;
      sharedRunning = false;
      // Flush only if stop() did not already emit this cycle's final.
      if (!finalFlushedThisCycle && (utteranceFinalParts.length || pendingFinal)) {
        flushPendingFinal();
      }
      handlers.onEnd?.();
      void intentionalStop;
    };

    return recognition;
  };

  return {
    supported: true,
    start: () => {
      if (sharedOwnerId !== ownerId) return;
      intentionalStop = false;
      resetUtteranceState();
      const rec = ensure();
      rec.lang = mapLanguage(lang);
      if (sharedRunning) return;
      try {
        rec.start();
      } catch {
        // InvalidStateError if already started — ignore.
      }
    },
    stop: () => {
      if (sharedOwnerId !== ownerId) return;
      intentionalStop = true;
      // Flush the merged utterance once on intentional stop (VAD end-of-speech).
      flushPendingFinal();
      try {
        sharedRecognition?.stop();
      } catch {
        /* noop */
      }
    },
    abort: () => {
      if (sharedOwnerId !== ownerId) return;
      intentionalStop = true;
      clearTimers();
      utteranceFinalParts = [];
      pendingFinal = '';
      pendingPartial = '';
      try {
        sharedRecognition?.abort();
      } catch {
        /* noop */
      }
      sharedRunning = false;
      // Drop handlers so a late onresult from the engine cannot double-fire.
      if (sharedRecognition) {
        sharedRecognition.onresult = null;
        sharedRecognition.onerror = null;
        sharedRecognition.onend = null;
        sharedRecognition.onstart = null;
      }
      sharedRecognition = null;
      sharedOwnerId = null;
    },
    setLanguage: (next) => {
      lang = next;
      if (sharedRecognition && sharedOwnerId === ownerId) {
        sharedRecognition.lang = mapLanguage(next);
      }
    },
    resetUtteranceState,
  };
}

/** Test/helper: tear down singleton (e.g. between tests). */
export function __resetSpeechRecognitionSingletonForTests() {
  destroySharedRecognition();
  nextOwnerId = 1;
}
