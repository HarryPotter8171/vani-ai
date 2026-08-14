/**
 * Microphone access helpers for Voice Mode.
 *
 * Mobile browsers (especially Android Chrome + Safari) require:
 * - secure context (HTTPS / localhost)
 * - getUserMedia inside a user gesture (before long awaits)
 * - progressive constraint fallbacks (strict constraints often fail)
 * - MediaRecorder mime negotiation (webm vs mp4)
 */

export type MicPermissionState =
  | 'unknown'
  | 'prompt'
  | 'granted'
  | 'denied'
  | 'blocked'
  | 'unavailable'
  | 'unsupported'
  | 'insecure';

export type MicFailureReason =
  | 'allow' // needs user grant (prompt)
  | 'denied'
  | 'blocked'
  | 'unavailable'
  | 'unsupported'
  | 'insecure';

export interface MicSupportResult {
  ok: boolean;
  reason?: MicFailureReason;
  message: string;
}

export interface MicRequestResult {
  stream: MediaStream;
}

/** Soft duplex constraints — prefer DSP features but never hard-require them. */
export const VOICE_AUDIO_CONSTRAINTS_SOFT: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

/** Ideal constraints — may fail on some Android devices; used first. */
export const VOICE_AUDIO_CONSTRAINTS_IDEAL: MediaTrackConstraints = {
  echoCancellation: { ideal: true },
  noiseSuppression: { ideal: true },
  autoGainControl: { ideal: true },
  channelCount: { ideal: 1 },
};

const CONSTRAINT_FALLBACKS: Array<MediaTrackConstraints | boolean> = [
  VOICE_AUDIO_CONSTRAINTS_IDEAL,
  VOICE_AUDIO_CONSTRAINTS_SOFT,
  true,
];

export function isSecureMicContext(): boolean {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext === true;
}

export function isGetUserMediaSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  return typeof navigator.mediaDevices?.getUserMedia === 'function';
}

export function isMediaRecorderSupported(): boolean {
  return typeof MediaRecorder !== 'undefined';
}

/** Preflight before showing the browser permission prompt. */
export function checkMicrophoneSupport(): MicSupportResult {
  if (typeof window === 'undefined') {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Voice Mode isn’t available in this environment.',
    };
  }
  if (!isSecureMicContext()) {
    return {
      ok: false,
      reason: 'insecure',
      message:
        'Voice Mode needs a secure connection (HTTPS). Open VANI over HTTPS and try again.',
    };
  }
  if (!isGetUserMediaSupported()) {
    return {
      ok: false,
      reason: 'unsupported',
      message:
        'This browser doesn’t support microphone access. Try Chrome or Safari, or keep chatting with text.',
    };
  }
  return {
    ok: true,
    message: 'Allow microphone access to start Voice Mode.',
  };
}

/**
 * Query Permissions API when available. Safari / some Android builds
 * throw or omit "microphone" — never let that break the flow.
 */
export async function queryMicrophonePermission(): Promise<
  'granted' | 'denied' | 'prompt' | 'unknown'
> {
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const status = await navigator.permissions.query({
      name: 'microphone' as PermissionName,
    });
    if (status.state === 'granted') return 'granted';
    if (status.state === 'denied') return 'denied';
    if (status.state === 'prompt') return 'prompt';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export function classifyMicrophoneError(err: unknown): MicFailureReason {
  const name =
    err && typeof err === 'object' && 'name' in err
      ? String((err as { name?: unknown }).name || '')
      : '';
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : '';
  const blob = `${name} ${message}`.toLowerCase();

  // Prefer explicit DOMException names over ambient secure-context checks so
  // unit tests / SSR classification stay accurate.
  if (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    blob.includes('permission denied') ||
    blob.includes('notallowed') ||
    (blob.includes('permission') && !blob.includes('https'))
  ) {
    return 'denied';
  }

  if (name === 'SecurityError' || blob.includes('secure context') || blob.includes('https')) {
    return 'insecure';
  }

  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'NotReadableError' ||
    name === 'TrackStartError' ||
    name === 'OverconstrainedError' ||
    name === 'ConstraintNotSatisfiedError' ||
    blob.includes('not found') ||
    blob.includes('could not start') ||
    blob.includes('device in use')
  ) {
    return 'unavailable';
  }

  if (
    name === 'NotSupportedError' ||
    (name === 'TypeError' && blob.includes('mediadevices'))
  ) {
    return 'unsupported';
  }

  if (!isGetUserMediaSupported()) return 'unsupported';
  if (!isSecureMicContext()) return 'insecure';

  return 'unavailable';
}

export function micFailureTitle(reason: MicFailureReason): string {
  switch (reason) {
    case 'allow':
      return 'Allow microphone access';
    case 'denied':
      return 'Permission denied';
    case 'blocked':
      return 'Permission denied';
    case 'unavailable':
      return 'Microphone unavailable';
    case 'unsupported':
      return 'Browser not supported';
    case 'insecure':
      return 'Secure connection required';
    default:
      return 'Microphone access needed';
  }
}

export function micFailureMessage(reason: MicFailureReason): string {
  switch (reason) {
    case 'allow':
      return 'Tap Allow when your browser asks, so VANI can hear you.';
    case 'denied':
      return 'Microphone access was denied. You can keep chatting with text, or allow the mic and try again.';
    case 'blocked':
      return 'Microphone access is blocked for this site. Update browser settings, then tap Try again.';
    case 'unavailable':
      return 'No microphone is available, or another app is using it. Check your device and try again.';
    case 'unsupported':
      return 'This browser can’t access the microphone. Try Chrome or Safari, or continue with text chat.';
    case 'insecure':
      return 'Voice Mode only works on HTTPS (or localhost). Switch to a secure URL to continue.';
    default:
      return 'Voice Mode needs microphone access. You can keep using text chat anytime.';
  }
}

/**
 * Request the mic with progressive constraint fallbacks.
 * MUST be called directly from a user gesture on mobile (before long awaits).
 */
export async function requestMicrophoneStream(): Promise<MediaStream> {
  const support = checkMicrophoneSupport();
  if (!support.ok) {
    const err = new Error(support.message);
    err.name =
      support.reason === 'insecure'
        ? 'SecurityError'
        : support.reason === 'unsupported'
          ? 'NotSupportedError'
          : 'NotAllowedError';
    throw err;
  }

  let lastError: unknown;
  for (const audio of CONSTRAINT_FALLBACKS) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio });
      return stream;
    } catch (err) {
      lastError = err;
      const name =
        err && typeof err === 'object' && 'name' in err
          ? String((err as { name?: unknown }).name)
          : '';
      // Permission failures won't succeed with softer constraints — stop early.
      if (
        name === 'NotAllowedError' ||
        name === 'PermissionDeniedError' ||
        name === 'SecurityError'
      ) {
        throw err;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Microphone unavailable');
}

/** Apply soft AEC constraints when possible — never throw. */
export async function ensureEchoCancellation(stream: MediaStream): Promise<void> {
  const track = stream.getAudioTracks()[0];
  if (!track) return;
  try {
    await track.applyConstraints({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  } catch {
    /* ignore — device may not support applying constraints mid-stream */
  }
}

/** Best-effort MediaRecorder mime for Android Chrome + Safari. */
export function pickMediaRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
    return '';
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      /* ignore */
    }
  }
  return '';
}

export function createVoiceMediaRecorder(stream: MediaStream): MediaRecorder | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const mime = pickMediaRecorderMimeType();
  try {
    return mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);
  } catch {
    try {
      return new MediaRecorder(stream);
    } catch {
      return null;
    }
  }
}

/** Stop all tracks on a stream without throwing. */
export function stopMediaStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  try {
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        /* noop */
      }
    }
  } catch {
    /* noop */
  }
}

/**
 * After a NotAllowedError, refine denied vs blocked via Permissions API.
 */
export async function refineDeniedReason(
  err: unknown
): Promise<MicFailureReason> {
  const base = classifyMicrophoneError(err);
  if (base !== 'denied') return base;
  const status = await queryMicrophonePermission();
  if (status === 'denied') return 'blocked';
  if (status === 'prompt') return 'allow';
  return 'denied';
}
