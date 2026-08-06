/**
 * Serial MP3 playback queue for streaming ElevenLabs TTS chunks.
 * Uses HTMLAudioElement only — no browser speechSynthesis.
 *
 * Producers (`expectMore` / `releaseExpect`) hold idle until in-flight
 * fetches finish so mid-stream gaps do not look like end-of-speech.
 */

export class Mp3PlaybackQueue {
  private queue: Blob[] = [];
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private draining = false;
  private stopped = false;
  private playing = false;
  private volume = 1;
  /** In-flight producers (TTS fetches) that may enqueue soon. */
  private producers = 0;
  private onStart?: () => void;
  private onEnd?: () => void;
  private onIdle?: () => void;
  private onLevel?: (level: number) => void;
  private levelTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    handlers: {
      onStart?: () => void;
      onEnd?: () => void;
      onIdle?: () => void;
      onLevel?: (level: number) => void;
    } = {}
  ) {
    this.onStart = handlers.onStart;
    this.onEnd = handlers.onEnd;
    this.onIdle = handlers.onIdle;
    this.onLevel = handlers.onLevel;
  }

  get isPlaying() {
    return this.playing || this.draining || this.queue.length > 0;
  }

  get pending() {
    return this.queue.length + (this.playing ? 1 : 0);
  }

  get hasPendingWork() {
    return this.isPlaying || this.producers > 0;
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.audio) this.audio.volume = this.volume;
  }

  /**
   * Reserve that more audio may arrive (call before starting a TTS fetch).
   * Prevents premature onIdle between streamed sentence chunks.
   */
  expectMore() {
    if (this.stopped) return;
    this.producers += 1;
  }

  /** Release one expectMore() reservation after fetch completes or aborts. */
  releaseExpect() {
    this.producers = Math.max(0, this.producers - 1);
    this.maybeEmitIdle();
  }

  enqueue(blob: Blob) {
    if (this.stopped || !blob.size) return;
    this.queue.push(blob);
    void this.drain();
  }

  /** Soft reset after interrupt so new chunks can enqueue. */
  reset() {
    this.stop({ emitIdle: false });
    this.stopped = false;
  }

  stop(options: { emitIdle?: boolean } = {}) {
    const emitIdle = options.emitIdle !== false;
    this.stopped = true;
    this.queue = [];
    this.producers = 0;
    this.draining = false;
    this.stopLevelPulse();
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    this.revokeUrl();
    const wasPlaying = this.playing;
    this.playing = false;
    if (emitIdle) {
      if (wasPlaying) this.onEnd?.();
      this.onIdle?.();
    }
  }

  dispose() {
    this.stop({ emitIdle: false });
    this.audio = null;
  }

  private revokeUrl() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  private ensureAudio() {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = 'auto';
    }
    this.audio.volume = this.volume;
    return this.audio;
  }

  private startLevelPulse() {
    if (this.levelTimer != null || !this.onLevel) return;
    this.levelTimer = setInterval(() => {
      // Synthetic speaking level for waveform while MP3 plays.
      const t = Date.now() / 180;
      this.onLevel?.(0.25 + Math.abs(Math.sin(t)) * 0.45);
    }, 80);
  }

  private stopLevelPulse() {
    if (this.levelTimer != null) {
      clearInterval(this.levelTimer);
      this.levelTimer = null;
    }
    this.onLevel?.(0);
  }

  private maybeEmitIdle() {
    if (this.stopped || this.draining || this.playing || this.queue.length > 0) {
      return;
    }
    if (this.producers > 0) return;
    this.onEnd?.();
    this.onIdle?.();
  }

  private async drain() {
    if (this.draining || this.stopped) return;
    this.draining = true;
    try {
      while (this.queue.length && !this.stopped) {
        const blob = this.queue.shift();
        if (!blob) break;
        await this.playBlob(blob);
      }
    } finally {
      this.draining = false;
      if (this.queue.length && !this.stopped) {
        void this.drain();
      } else if (!this.stopped && !this.playing) {
        this.maybeEmitIdle();
      }
    }
  }

  private playBlob(blob: Blob): Promise<void> {
    return new Promise((resolve) => {
      if (this.stopped) {
        resolve();
        return;
      }
      const audio = this.ensureAudio();
      this.revokeUrl();
      const url = URL.createObjectURL(blob);
      this.objectUrl = url;
      audio.src = url;

      const finish = () => {
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        this.playing = false;
        this.stopLevelPulse();
        resolve();
      };
      const onEnded = () => finish();
      const onError = () => finish();

      audio.addEventListener('ended', onEnded);
      audio.addEventListener('error', onError);

      if (!this.playing) {
        this.playing = true;
        this.onStart?.();
        this.startLevelPulse();
      } else {
        this.playing = true;
        this.startLevelPulse();
      }

      void audio.play().catch(() => finish());
    });
  }
}
