/**
 * Lightweight voice-engine stage logger.
 * Stages: Listening → Thinking → Speaking → Finished
 */

export type VoiceEngineStage =
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'finished'
  | 'error'
  | 'debug';

const PREFIX = '[voice-engine]';

export function voiceEngineLog(stage: VoiceEngineStage, message: string, meta?: Record<string, unknown>) {
  const payload = meta ? ` ${JSON.stringify(meta)}` : '';
  if (stage === 'error') {
    console.error(`${PREFIX} ${stage.toUpperCase()}: ${message}${payload}`);
    return;
  }
  if (stage === 'debug') {
    if (process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_VOICE_DEBUG === '1') {
      console.debug(`${PREFIX} ${message}${payload}`);
    }
    return;
  }
  console.info(`${PREFIX} ${stage.toUpperCase()}: ${message}${payload}`);
}
