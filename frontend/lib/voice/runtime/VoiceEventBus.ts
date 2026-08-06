/**
 * Typed voice event bus — single ingress for lifecycle-adjacent events.
 * Phase 1: dedupe utterance finals by turn id before side effects.
 */

import type { VoiceLifecycleState } from './LifecycleManager';

export type VoiceBusEvent =
  | { type: 'lifecycle.state'; state: VoiceLifecycleState; reason: string }
  | { type: 'utterance.final'; turnId: string; text: string; source: string }
  | { type: 'utterance.send.start'; turnId: string }
  | { type: 'utterance.send.complete'; turnId: string }
  | { type: 'assistant.speak.start'; messageId: string }
  | { type: 'assistant.speak.complete'; generation: number }
  | { type: 'assistant.speak.failed'; generation: number };

type Handler = (event: VoiceBusEvent) => void;

export class VoiceEventBus {
  private handlers = new Set<Handler>();
  private emittedFinalTurnIds = new Set<string>();

  on(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit(event: VoiceBusEvent) {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch {
        /* noop */
      }
    }
  }

  /**
   * Emit utterance final once per turnId. Returns false if duplicate.
   */
  emitUtteranceFinal(turnId: string, text: string, source: string): boolean {
    if (this.emittedFinalTurnIds.has(turnId)) return false;
    this.emittedFinalTurnIds.add(turnId);
    this.emit({ type: 'utterance.final', turnId, text, source });
    return true;
  }

  reset() {
    this.emittedFinalTurnIds.clear();
  }
}
