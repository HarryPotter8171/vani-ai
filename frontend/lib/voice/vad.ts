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
  private noiseFloor = 0.004;
  private readonly baseThreshold: number;
  private readonly silenceMs: number;
  private readonly minSpeechMs: number;
  private readonly startFrames: number;
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

  stop() {
    this.stopped = true;
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
 * echoCancellation + noiseSuppression + autoGainControl + Chrome DSP hints.
 */
export const VOICE_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: { ideal: true },
  noiseSuppression: { ideal: true },
  autoGainControl: { ideal: true },
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48000 },
  // Chromium-specific DSP flags (ignored by other browsers).
  ...({
    googEchoCancellation: true,
    googNoiseSuppression: true,
    googAutoGainControl: true,
    googHighpassFilter: true,
    googTypingNoiseDetection: true,
  } as MediaTrackConstraints),
};

/** Apply / refresh AEC constraints on an existing mic track. */
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
    // Constraints already set at getUserMedia — safe to ignore.
  }
}
