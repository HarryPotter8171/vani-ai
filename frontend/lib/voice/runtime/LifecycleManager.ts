/**
 * LifecycleManager — sole authority for voice session state transitions.
 *
 * Phase 1 guarantees:
 * - One utterance commit per listen cycle
 * - One backend send per committed turn
 * - One assistant speak per message id
 * - speaking/thinking → listening after TTS skip/complete/fail
 */

import { voiceEngineLog } from '../voiceEngineLog';
import { isDuplicateTranscript, normalizeTranscript } from '../speechRecognition';
import type { VoiceEventBus } from './VoiceEventBus';

export type VoiceLifecycleState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'muted'
  | 'error';

export type VoiceLifecyclePhase = VoiceLifecycleState | 'connecting';

type StateListener = (state: VoiceLifecycleState) => void;

const SUBMIT_DEDUP_MS = 4000;
const LISTEN_RESTART_MS = 120;

export class LifecycleManager {
  private state: VoiceLifecycleState = 'idle';
  private live = false;
  private listeners = new Set<StateListener>();
  private bus: VoiceEventBus | null;

  private epoch = 0;
  private listenCycleId = 0;
  private listenFinalCommitted = false;
  private listenFinalizeInFlight = false;
  private currentTurnId: string | null = null;
  private sendInFlight = false;

  private lastSubmitted = { text: '', at: 0 };
  private spokenAssistantId: string | null = null;
  private speakGeneration = 0;
  private listenRestartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(bus?: VoiceEventBus) {
    this.bus = bus ?? null;
  }

  isBusy(): boolean {
    return this.state === 'thinking' || this.state === 'speaking';
  }

  canReturnToListening(): boolean {
    return this.state !== 'thinking';
  }

  getState(): VoiceLifecycleState {
    return this.state;
  }

  isLive(): boolean {
    return this.live;
  }

  getCurrentTurnId(): string | null {
    return this.currentTurnId;
  }

  bumpEpoch(): number {
    this.epoch += 1;
    return this.epoch;
  }

  getEpoch(): number {
    return this.epoch;
  }

  setLive(on: boolean) {
    this.live = on;
    if (!on) this.resetSession();
  }

  onStateChange(fn: StateListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emitState(reason: string) {
    this.bus?.emit({ type: 'lifecycle.state', state: this.state, reason });
    for (const fn of this.listeners) {
      try {
        fn(this.state);
      } catch {
        /* noop */
      }
    }
  }

  transition(next: VoiceLifecycleState, reason: string) {
    if (this.state === next) return;
    voiceEngineLog(
      next === 'error'
        ? 'error'
        : next === 'listening'
          ? 'listening'
          : next === 'thinking'
            ? 'thinking'
            : next === 'speaking'
              ? 'speaking'
              : 'finished',
      `state ${this.state} → ${next}: ${reason}`
    );
    this.state = next;
    this.emitState(reason);
  }

  resetSession() {
    this.epoch = this.bumpEpoch();
    this.listenCycleId = 0;
    this.listenFinalCommitted = false;
    this.listenFinalizeInFlight = false;
    this.currentTurnId = null;
    this.sendInFlight = false;
    this.lastSubmitted = { text: '', at: 0 };
    this.spokenAssistantId = null;
    this.speakGeneration += 1;
    this.clearListenRestart();
    this.bus?.reset();
    this.state = 'idle';
    this.emitState('reset');
  }

  beginListenCycle(): number {
    this.listenCycleId += 1;
    this.listenFinalCommitted = false;
    this.listenFinalizeInFlight = false;
    this.currentTurnId = null;
    this.transition('listening', 'mic active');
    return this.listenCycleId;
  }

  getListenCycleId(): number {
    return this.listenCycleId;
  }

  private nextTurnId(): string {
    const id = `t:${this.listenCycleId}:${Date.now().toString(36)}`;
    this.currentTurnId = id;
    return id;
  }

  tryCommitUserUtterance(text: string, source: string): string | null {
    const trimmed = text.trim();
    if (!trimmed || !this.live) return null;

    if (this.state === 'thinking' || this.state === 'speaking') {
      voiceEngineLog('debug', 'reject commit — busy', { source, state: this.state });
      return null;
    }

    const now = Date.now();
    if (
      isDuplicateTranscript(trimmed, this.lastSubmitted.text, {
        aAt: now,
        bAt: this.lastSubmitted.at,
        windowMs: SUBMIT_DEDUP_MS,
      })
    ) {
      voiceEngineLog('debug', 'reject duplicate utterance', {
        source,
        text: normalizeTranscript(trimmed).slice(0, 60),
      });
      return null;
    }

    if (this.listenFinalCommitted) {
      voiceEngineLog('debug', 'reject commit — cycle already committed', { source });
      return null;
    }

    const turnId = this.nextTurnId();
    if (this.bus && !this.bus.emitUtteranceFinal(turnId, trimmed, source)) {
      voiceEngineLog('debug', 'reject commit — bus duplicate final', { source, turnId });
      return null;
    }

    this.listenFinalCommitted = true;
    this.lastSubmitted = { text: trimmed, at: now };
    this.spokenAssistantId = null;
    this.clearListenRestart();
    this.transition('thinking', `user utterance (${source})`);
    voiceEngineLog('thinking', 'utterance committed', {
      source,
      turnId,
      chars: trimmed.length,
    });
    return trimmed;
  }

  async requestListenFinalize(
    cycleId: number,
    finalize: () => Promise<string | null>
  ): Promise<string | null> {
    if (cycleId !== this.listenCycleId) return null;
    if (this.listenFinalCommitted) return null;
    if (this.listenFinalizeInFlight) return null;
    if (this.state !== 'listening') return null;

    this.listenFinalizeInFlight = true;
    try {
      const text = (await finalize())?.trim() || null;
      if (!text || cycleId !== this.listenCycleId) return null;
      return this.tryCommitUserUtterance(text, 'vad-finalize');
    } finally {
      if (cycleId === this.listenCycleId) {
        this.listenFinalizeInFlight = false;
      }
    }
  }

  onRecognitionFinal(text: string): string | null {
    if (this.listenFinalCommitted || this.listenFinalizeInFlight) {
      voiceEngineLog('debug', 'ignore recognition final — already handled');
      return null;
    }
    return this.tryCommitUserUtterance(text, 'recognition-final');
  }

  /** Gate: exactly one backend send per committed turn. */
  tryBeginSend(): boolean {
    if (!this.currentTurnId || this.sendInFlight) {
      voiceEngineLog('debug', 'reject send — none in flight or no turn', {
        turnId: this.currentTurnId,
        sendInFlight: this.sendInFlight,
      });
      return false;
    }
    this.sendInFlight = true;
    this.bus?.emit({ type: 'utterance.send.start', turnId: this.currentTurnId });
    return true;
  }

  completeSend(success: boolean) {
    if (this.currentTurnId) {
      this.bus?.emit({ type: 'utterance.send.complete', turnId: this.currentTurnId });
    }
    this.sendInFlight = false;
    this.currentTurnId = null;
    if (!success) {
      this.listenFinalCommitted = false;
      this.transition('error', 'send failed');
    }
  }

  onAssistantStreamStart(messageId: string) {
    voiceEngineLog('thinking', 'assistant streaming', { messageId });
  }

  tryBeginAssistantSpeak(messageId: string, text: string): string | null {
    const clean = text.trim();
    if (!clean || !this.live) return null;
    if (this.spokenAssistantId === messageId) {
      voiceEngineLog('debug', 'skip duplicate assistant speak', { messageId });
      return null;
    }
    this.spokenAssistantId = messageId;
    this.speakGeneration += 1;
    this.clearListenRestart();
    this.transition('speaking', 'assistant TTS');
    this.bus?.emit({ type: 'assistant.speak.start', messageId });
    return clean;
  }

  getSpeakGeneration(): number {
    return this.speakGeneration;
  }

  invalidateSpeak() {
    this.speakGeneration += 1;
  }

  onSpeakComplete(generation: number) {
    if (generation !== this.speakGeneration) return;
    voiceEngineLog('finished', 'TTS complete');
    this.bus?.emit({ type: 'assistant.speak.complete', generation });
    this.returnToListeningAfterSpeak('TTS complete');
  }

  onSpeakFailed(generation: number) {
    if (generation !== this.speakGeneration) return;
    voiceEngineLog('error', 'TTS failed');
    this.bus?.emit({ type: 'assistant.speak.failed', generation });
    this.returnToListeningAfterSpeak('TTS failed');
  }

  /** Assistant reply received but no audio (speaker off, empty, muted). */
  onAssistantReplySkipped(messageId: string) {
    this.spokenAssistantId = messageId;
    this.returnToListeningAfterSpeak('assistant reply skipped');
  }

  onSendFailed() {
    this.completeSend(false);
  }

  private returnToListeningAfterSpeak(reason: string) {
    if (!this.live) {
      this.transition('idle', reason);
      return;
    }
    this.listenFinalCommitted = false;
    this.listenFinalizeInFlight = false;
    this.currentTurnId = null;
    this.transition('listening', reason);
  }

  clearListenRestart() {
    if (this.listenRestartTimer) {
      clearTimeout(this.listenRestartTimer);
      this.listenRestartTimer = null;
    }
  }

  scheduleReturnToListening(onRestart?: () => void) {
    this.clearListenRestart();
    this.listenRestartTimer = setTimeout(() => {
      this.listenRestartTimer = null;
      if (!this.live) return;
      if (this.state === 'thinking') return;
      if (this.state === 'listening') {
        onRestart?.();
        return;
      }
      voiceEngineLog('listening', 'return after speak');
      this.listenFinalCommitted = false;
      this.listenFinalizeInFlight = false;
      this.currentTurnId = null;
      if (this.state === 'speaking' || this.state === 'error') {
        this.transition('listening', 'scheduled return');
      }
      onRestart?.();
    }, LISTEN_RESTART_MS);
  }

  interrupt() {
    this.invalidateSpeak();
    this.listenFinalCommitted = false;
    this.listenFinalizeInFlight = false;
    this.sendInFlight = false;
    this.currentTurnId = null;
    this.clearListenRestart();
    voiceEngineLog('debug', 'interrupt');
    if (this.live) {
      this.transition('listening', 'interrupt');
    }
  }

  markAssistantHandled(messageId: string) {
    this.spokenAssistantId = messageId;
  }
}
