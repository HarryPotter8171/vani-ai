/**
 * Voice activity detection via AnalyserNode RMS energy + adaptive noise floor.
 * Used for auto-stop-on-silence and barge-in interrupt.
 */

export interface VadOptions {
  /** Silence threshold 0–1 (default ~0.016). Used as a floor; adapts upward with noise. */
  threshold?: number;
  /** ms of continuous silence before firing onSilence. */
  silenceMs?: number;
  /** ms of speech required before silence can trigger (avoids instant stop). */
  minSpeechMs?: number;
  /** Require this many consecutive loud frames before speech-start (anti-glitch). */
  startFrames?: number;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onLevel?: (level: number) => void;
}

export class VoiceActivityDetector {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private raf = 0;
  private speaking = false;
  private speechStartedAt = 0;
  private silenceStartedAt = 0;
  private loudFrames = 0;
  private stopped = false;
  /** When true, levels still update but speech-start/end callbacks are suppressed. */
  private suspended = false;
  /** Ignore speech-start until this performance.now() timestamp (TTS echo hold-off). */
  private ignoreUntil = 0;
  private noiseFloor = 0.004;
  private baseThreshold: number;
  private readonly silenceMs: number;
  private readonly minSpeechMs: number;
  private startFrames: number;
  private readonly onSpeechStart?: () => void;
  private readonly onSpeechEnd?: () => void;
  private readonly onLevel?: (level: number) => void;

  constructor(options: VadOptions = {}) {
    this.baseThreshold = options.threshold ?? 0.016;
    this.silenceMs = options.silenceMs ?? 700;
    this.minSpeechMs = options.minSpeechMs ?? 300;
    this.startFrames = options.startFrames ?? 3;
    this.onSpeechStart = options.onSpeechStart;
    this.onSpeechEnd = options.onSpeechEnd;
    this.onLevel = options.onLevel;
  }

  async start(stream: MediaStream) {
    this.stop();
    this.stopped = false;
    this.suspended = false;
    this.ignoreUntil = 0;
    this.loudFrames = 0;
    this.noiseFloor = 0.004;
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.source = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.55;
    this.source.connect(this.analyser);
    this.tick();
  }

  /**
   * Pause speech detection (e.g. while TTS is playing). Levels still fire for UI.
   * Resets in-progress speech so a mid-utterance suspend cannot fire on resume.
   */
  setSuspended(suspended: boolean) {
    this.suspended = suspended;
    if (suspended) {
      this.loudFrames = 0;
      this.speaking = false;
      this.silenceStartedAt = 0;
    }
  }

  /** Hold off speech-start for `ms` (speaker echo right after TTS begins). */
  ignoreSpeechFor(ms: number) {
    const hold = Math.max(0, Number(ms) || 0);
    this.ignoreUntil = performance.now() + hold;
    this.loudFrames = 0;
    this.speaking = false;
    this.silenceStartedAt = 0;
  }

  /** Raise/lower energy floor at runtime (barge-in vs listen). */
  setThreshold(threshold: number) {
    if (Number.isFinite(threshold) && threshold > 0) {
      this.baseThreshold = threshold;
    }
  }

  setStartFrames(frames: number) {
    if (Number.isFinite(frames) && frames >= 1) {
      this.startFrames = Math.floor(frames);
    }
  }

  private effectiveThreshold() {
    // Track ambient noise; speak must clear noise floor + base threshold.
    return Math.max(this.baseThreshold, this.noiseFloor * 2.8 + 0.006);
  }

  private tick = () => {
    if (this.stopped || !this.analyser) return;
    const data = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(data);

    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    this.onLevel?.(Math.min(1, rms * 4));

    const now = performance.now();
    // Suspended / TTS hold-off: keep sampling noise floor, never fire speech callbacks.
    if (this.suspended || now < this.ignoreUntil) {
      if (!this.speaking && rms < this.effectiveThreshold()) {
        this.noiseFloor = this.noiseFloor * 0.95 + rms * 0.05;
      }
      this.loudFrames = 0;
      this.raf = requestAnimationFrame(this.tick);
      return;
    }

    const threshold = this.effectiveThreshold();
    const isLoud = rms >= threshold;

    // Adapt noise floor only while not speaking (ignore AI echo / user speech).
    if (!this.speaking && !isLoud) {
      this.noiseFloor = this.noiseFloor * 0.95 + rms * 0.05;
    }

    if (isLoud) {
      this.silenceStartedAt = 0;
      this.loudFrames += 1;
      if (!this.speaking && this.loudFrames >= this.startFrames) {
        this.speaking = true;
        this.speechStartedAt = now;
        this.onSpeechStart?.();
      }
    } else {
      this.loudFrames = 0;
      if (this.speaking) {
        if (!this.silenceStartedAt) this.silenceStartedAt = now;
        const spokenLongEnough = now - this.speechStartedAt >= this.minSpeechMs;
        const silentLongEnough = now - this.silenceStartedAt >= this.silenceMs;
        if (spokenLongEnough && silentLongEnough) {
          this.speaking = false;
          this.silenceStartedAt = 0;
          this.onSpeechEnd?.();
        }
      }
    }

    this.raf = requestAnimationFrame(this.tick);
  };

  get isSpeaking() {
    return this.speaking;
  }

  get isSuspended() {
    return this.suspended;
  }

  stop() {
    this.stopped = true;
    this.suspended = false;
    this.ignoreUntil = 0;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    try {
      this.source?.disconnect();
    } catch {
      /* noop */
    }
    this.source = null;
    this.analyser = null;
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }
    this.speaking = false;
    this.silenceStartedAt = 0;
    this.loudFrames = 0;
  }
}

/**
 * Collect waveform levels from a mic stream for UI animation.
 * Skips onUpdate when bar values have not meaningfully changed to avoid
 * React update storms from requestAnimationFrame.
 */
export class WaveformSampler {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private raf = 0;
  private stopped = false;
  private lastLevels: number[] | null = null;
  private readonly bars: number;
  private readonly onUpdate: (levels: number[]) => void;
  private readonly epsilon: number;

  constructor(bars: number, onUpdate: (levels: number[]) => void, epsilon = 0.02) {
    this.bars = bars;
    this.onUpdate = onUpdate;
    this.epsilon = epsilon;
  }

  async start(stream: MediaStream) {
    this.stop();
    this.stopped = false;
    this.lastLevels = null;
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.source = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.source.connect(this.analyser);
    this.tick();
  }

  private levelsChanged(next: number[]): boolean {
    const prev = this.lastLevels;
    if (!prev || prev.length !== next.length) return true;
    for (let i = 0; i < next.length; i++) {
      if (Math.abs(prev[i] - next[i]) > this.epsilon) return true;
    }
    return false;
  }

  private tick = () => {
    if (this.stopped || !this.analyser) return;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    const levels: number[] = [];
    const step = Math.floor(data.length / this.bars) || 1;
    for (let i = 0; i < this.bars; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) sum += data[i * step + j] || 0;
      levels.push(Math.min(1, sum / step / 180));
    }
    if (this.levelsChanged(levels)) {
      this.lastLevels = levels;
      this.onUpdate(levels);
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  stop() {
    this.stopped = true;
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.lastLevels = null;
    try {
      this.source?.disconnect();
    } catch {
      /* noop */
    }
    this.source = null;
    this.analyser = null;
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }
  }
}

/**
 * Preferred browser audio constraints for duplex voice.
 * Soft booleans — hard ideals / goog* flags break getUserMedia on some Android devices.
 * Prefer `requestMicrophoneStream()` from `@/lib/voice/microphone` for acquisition.
 */
export {
  VOICE_AUDIO_CONSTRAINTS_SOFT as VOICE_AUDIO_CONSTRAINTS,
  ensureEchoCancellation,
  requestMicrophoneStream,
} from '@/lib/voice/microphone';

