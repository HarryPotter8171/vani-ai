/**
 * PCM playback with gapless scheduling, crossfade,
 * click/pop removal, smooth interrupt fade, streaming chunk enqueue,
 * volume, and mute speaker.
 */

export interface PlaybackMeta {
  sampleRate: number;
  channels: number;
  sampleWidth: number;
}

type QueueItem =
  | { kind: 'pcm'; buffer: ArrayBuffer; meta: PlaybackMeta; speed: number }
  | { kind: 'silence'; seconds: number };

/** Default natural pause between spoken sentences (seconds). Keep short for Live Mode. */
export const SENTENCE_PAUSE_SEC = 0.05;

/** Crossfade / edge-fade length (seconds) — removes clicks between chunks. */
const EDGE_FADE_SEC = 0.008;
/** Overlap when chaining PCM from the same utterance stream. */
const CROSSFADE_SEC = 0.012;
/** Lookahead when the queue is empty (first audio / recovering). */
const LOOKAHEAD_EMPTY_SEC = 0.012;
/** Lookahead when buffer is healthy (adaptive buffering). */
const LOOKAHEAD_HEALTHY_SEC = 0.04;
/** Smooth interrupt fade-out. */
const INTERRUPT_FADE_SEC = 0.04;

export class AudioPlaybackQueue {
  private ctx: AudioContext | null = null;
  private queue: QueueItem[] = [];
  private playing = false;
  private stopped = false;
  private speakerOn = true;
  private volume = 1;
  private currentSource: AudioBufferSourceNode | null = null;
  private activeSources = new Set<AudioBufferSourceNode>();
  private playCursor = 0;
  private draining = false;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private onStart?: () => void;
  private onEnd?: () => void;
  private onIdle?: () => void;
  private onLevel?: (level: number) => void;
  private levelRaf: number | null = null;
  /** True after a PCM chunk so the next PCM can crossfade instead of hard-join. */
  private lastWasPcm = false;

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
    return this.playing || this.activeSources.size > 0;
  }

  get pending() {
    return this.queue.length;
  }

  get isSpeakerOn() {
    return this.speakerOn;
  }

  setSpeakerOn(on: boolean) {
    this.speakerOn = on;
    if (!on) this.stop();
    else this.applyGain(false);
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    this.applyGain(false);
  }

  getVolume() {
    return this.volume;
  }

  private applyGain(smooth: boolean) {
    if (!this.gain || !this.ctx) return;
    const target = this.speakerOn ? this.volume : 0;
    if (smooth) {
      const now = this.ctx.currentTime;
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setValueAtTime(this.gain.gain.value, now);
      this.gain.gain.linearRampToValueAtTime(target, now + 0.03);
    } else {
      this.gain.gain.value = target;
    }
  }

  private async ensureCtx() {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.gain = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.5;
      this.gain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.applyGain(false);
      this.playCursor = this.ctx.currentTime;
      this.lastWasPcm = false;
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }

  enqueuePcm(buffer: ArrayBuffer, meta: PlaybackMeta, speed = 1) {
    if (this.stopped || !this.speakerOn) return;
    this.queue.push({ kind: 'pcm', buffer, meta, speed });
    void this.drain();
  }

  /** Insert a short natural pause (e.g. between sentences). */
  enqueueSilence(seconds = SENTENCE_PAUSE_SEC) {
    if (this.stopped || !this.speakerOn) return;
    const s = Math.min(0.5, Math.max(0.04, seconds));
    this.queue.push({ kind: 'silence', seconds: s });
    void this.drain();
  }

  /** Hard interrupt — fade out, stop current audio, clear queue. */
  stop(options: { emitIdle?: boolean } = {}) {
    const emitIdle = options.emitIdle !== false;
    this.stopped = true;
    this.queue = [];
    this.stopLevelMonitor();
    this.lastWasPcm = false;

    // Smooth gain fade before killing sources — removes click on barge-in.
    if (this.ctx && this.gain) {
      const now = this.ctx.currentTime;
      try {
        this.gain.gain.cancelScheduledValues(now);
        this.gain.gain.setValueAtTime(this.gain.gain.value, now);
        this.gain.gain.linearRampToValueAtTime(0, now + INTERRUPT_FADE_SEC);
      } catch {
        /* noop */
      }
    }

    const sources = [...this.activeSources];
    const kill = () => {
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          /* noop */
        }
      }
      this.activeSources.clear();
      this.currentSource = null;
      this.playCursor = 0;
      if (this.gain) {
        this.gain.gain.value = this.speakerOn ? this.volume : 0;
      }
    };

    if (sources.length && this.ctx) {
      setTimeout(kill, Math.ceil(INTERRUPT_FADE_SEC * 1000) + 4);
    } else {
      kill();
    }

    const wasPlaying = this.playing;
    this.playing = false;
    this.draining = false;
    if (emitIdle) {
      if (wasPlaying) this.onEnd?.();
      this.onIdle?.();
    }
  }

  /** Soft reset so the queue can accept new items after an interrupt (no idle callback). */
  reset() {
    this.stop({ emitIdle: false });
    this.stopped = false;
  }

  clear() {
    this.queue = [];
  }

  async dispose() {
    this.stop();
    if (this.ctx) {
      await this.ctx.close().catch(() => undefined);
      this.ctx = null;
      this.gain = null;
      this.analyser = null;
    }
  }

  private startLevelMonitor() {
    if (!this.onLevel || !this.analyser) return;
    this.stopLevelMonitor();
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    const tick = () => {
      if (!this.analyser || (!this.playing && this.activeSources.size === 0)) {
        this.onLevel?.(0);
        this.levelRaf = null;
        return;
      }
      this.analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      this.onLevel?.(Math.min(1, Math.sqrt(sum / data.length) * 4));
      this.levelRaf = requestAnimationFrame(tick);
    };
    this.levelRaf = requestAnimationFrame(tick);
  }

  private stopLevelMonitor() {
    if (this.levelRaf != null) {
      cancelAnimationFrame(this.levelRaf);
      this.levelRaf = null;
    }
    this.onLevel?.(0);
  }

  private markIdleIfDone() {
    if (this.stopped) return;
    if (this.queue.length > 0 || this.draining || this.activeSources.size > 0) return;
    if (!this.playing) {
      this.onIdle?.();
      return;
    }
    this.playing = false;
    this.lastWasPcm = false;
    this.stopLevelMonitor();
    this.onEnd?.();
    this.onIdle?.();
  }

  private async drain() {
    if (this.draining || this.stopped) return;
    this.draining = true;

    try {
      while (this.queue.length && !this.stopped) {
        const next = this.queue.shift();
        if (!next) break;

        if (next.kind === 'pcm') {
          await this.schedulePcm(next.buffer, next.meta, next.speed);
        } else if (next.kind === 'silence') {
          this.lastWasPcm = false;
          await this.scheduleSilence(next.seconds);
        }
      }
    } finally {
      this.draining = false;
      if (this.queue.length && !this.stopped) {
        void this.drain();
      } else {
        this.markIdleIfDone();
      }
    }
  }

  private async scheduleSilence(seconds: number) {
    const ctx = await this.ensureCtx();
    const now = ctx.currentTime;
    if (this.playCursor < now) this.playCursor = now;
    this.playCursor += seconds;
    if (!this.playing) {
      this.playing = true;
      this.onStart?.();
      this.startLevelMonitor();
    }
  }

  /**
   * Decode PCM, apply edge fades (click removal), schedule with optional
   * crossfade overlap against the previous PCM chunk.
   */
  private async schedulePcm(buffer: ArrayBuffer, meta: PlaybackMeta, speed: number) {
    const ctx = await this.ensureCtx();
    const sampleRate = meta.sampleRate || 24000;
    const channels = meta.channels || 1;
    const view = new DataView(buffer);
    const frameCount = Math.floor(buffer.byteLength / 2 / channels);
    if (frameCount <= 0) return;

    const audioBuffer = ctx.createBuffer(channels, frameCount, sampleRate);
    const fadeSamples = Math.min(
      Math.floor(EDGE_FADE_SEC * sampleRate),
      Math.floor(frameCount / 4)
    );

    for (let ch = 0; ch < channels; ch++) {
      const channel = audioBuffer.getChannelData(ch);
      for (let i = 0; i < frameCount; i++) {
        let sample = view.getInt16((i * channels + ch) * 2, true) / 32768;
        // Soft edge fades remove clicks/pops at chunk boundaries.
        if (fadeSamples > 0) {
          if (i < fadeSamples) sample *= i / fadeSamples;
          else if (i >= frameCount - fadeSamples) {
            sample *= (frameCount - 1 - i) / fadeSamples;
          }
        }
        channel[i] = sample;
      }
    }

    const rate = Math.min(1.5, Math.max(0.7, speed));
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = rate;
    source.connect(this.gain || ctx.destination);

    const now = ctx.currentTime;
    // Adaptive buffering: smaller lookahead when starving, larger when healthy.
    const healthy = this.queue.length > 0 || this.activeSources.size > 0;
    const lookahead = healthy ? LOOKAHEAD_HEALTHY_SEC : LOOKAHEAD_EMPTY_SEC;
    if (this.playCursor < now + lookahead) this.playCursor = now + lookahead;

    // Crossfade continuous PCM by overlapping slightly with the prior chunk.
    if (this.lastWasPcm) {
      this.playCursor = Math.max(now, this.playCursor - CROSSFADE_SEC);
    }

    const startAt = this.playCursor;
    const duration = audioBuffer.duration / rate;
    this.playCursor = startAt + duration;
    this.lastWasPcm = true;

    this.activeSources.add(source);
    this.currentSource = source;

    if (!this.playing) {
      this.playing = true;
      this.onStart?.();
      this.startLevelMonitor();
    }

    // Ensure audible gain after a prior interrupt fade.
    if (this.gain && this.speakerOn) {
      const gNow = ctx.currentTime;
      if (this.gain.gain.value < this.volume * 0.9) {
        this.gain.gain.cancelScheduledValues(gNow);
        this.gain.gain.setValueAtTime(Math.max(0.001, this.gain.gain.value), gNow);
        this.gain.gain.linearRampToValueAtTime(this.volume, gNow + 0.02);
      }
    }

    source.onended = () => {
      this.activeSources.delete(source);
      if (this.currentSource === source) this.currentSource = null;
      this.markIdleIfDone();
    };

    try {
      source.start(startAt);
    } catch {
      this.activeSources.delete(source);
    }
  }
}

/** Split streamed assistant text into speakable sentence chunks. */
export function extractSpeakableChunks(
  buffer: string,
  options: { force?: boolean; minChars?: number } = {}
): { speakable: string[]; rest: string } {
  // Low min so first sentence starts TTS immediately (target: first audio <500ms).
  const minChars = options.minChars ?? 6;
  const force = options.force ?? false;
  const speakable: string[] = [];
  let rest = buffer;

  const re = /[.!?…।॥]+\s+/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = re.exec(rest)) !== null) {
    const end = match.index + match[0].length;
    const chunk = rest.slice(lastIndex, end).trim();
    if (chunk.length >= minChars || (chunk.length > 0 && speakable.length > 0)) {
      speakable.push(chunk);
      lastIndex = end;
    }
  }

  rest = rest.slice(lastIndex);

  if (force && rest.trim()) {
    speakable.push(rest.trim());
    rest = '';
  }

  if (!force && rest.includes('\n\n')) {
    const parts = rest.split(/\n{2,}/);
    const head = parts.slice(0, -1).join(' ').trim();
    rest = parts[parts.length - 1] || '';
    if (head) speakable.push(head);
  }

  // Flush on comma/clause earlier for snappier first spoken audio.
  if (!force && speakable.length === 0 && rest.length >= 28) {
    const comma = rest.search(/[,;:]\s+/);
    if (comma > 10 && comma < rest.length - 4) {
      const end = comma + (rest.slice(comma).match(/[,;:]\s+/)?.[0].length || 2);
      const head = rest.slice(0, end).trim();
      if (head.length >= minChars) {
        speakable.push(head);
        rest = rest.slice(end);
      }
    }
  }

  // Long unbroken clause — start speaking without waiting for punctuation.
  if (!force && speakable.length === 0 && rest.length >= 72) {
    const cut = rest.lastIndexOf(' ', 64);
    if (cut > 24) {
      speakable.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trimStart();
    }
  }

  return { speakable, rest };
}

export function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/[*_~>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
