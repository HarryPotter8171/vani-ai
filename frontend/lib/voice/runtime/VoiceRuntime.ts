/**
 * Voice runtime singleton — Phase 1 skeleton.
 * Owns LifecycleManager + VoiceEventBus for the active Live session.
 */

import { LifecycleManager } from './LifecycleManager';
import { VoiceEventBus } from './VoiceEventBus';

export class VoiceRuntime {
  readonly bus = new VoiceEventBus();
  readonly lifecycle: LifecycleManager;

  constructor() {
    this.lifecycle = new LifecycleManager(this.bus);
  }

  reset() {
    this.bus.reset();
    this.lifecycle.resetSession();
  }
}

let activeRuntime: VoiceRuntime | null = null;

export function getVoiceRuntime(): VoiceRuntime {
  if (!activeRuntime) activeRuntime = new VoiceRuntime();
  return activeRuntime;
}

export function resetVoiceRuntime() {
  activeRuntime?.reset();
  activeRuntime = null;
}

/** Lifecycle-only accessor (replaces getVoiceEngine). */
export function getVoiceLifecycle(): LifecycleManager {
  return getVoiceRuntime().lifecycle;
}
