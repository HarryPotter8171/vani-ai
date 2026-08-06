/**
 * @deprecated Import from `@/lib/voice/runtime/VoiceRuntime` for new code.
 * Re-exports LifecycleManager as VoiceEngine to preserve existing API surface.
 */

export {
  LifecycleManager as VoiceEngine,
  type VoiceLifecycleState as VoiceEngineState,
  type VoiceLifecyclePhase as VoiceEnginePhase,
} from './runtime/LifecycleManager';

export {
  getVoiceLifecycle as getVoiceEngine,
  resetVoiceRuntime as resetVoiceEngine,
} from './runtime/VoiceRuntime';
