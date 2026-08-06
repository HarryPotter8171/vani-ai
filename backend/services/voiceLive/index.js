/**
 * Gemini Live Native Audio voice engine (Phase 1 backend).
 *
 * Activated when VOICE_ENGINE=live. Legacy STT/TTS voice remains the default
 * (VOICE_ENGINE=legacy) and is never removed by this package.
 */

export {
  VOICE_ENGINE_LEGACY,
  VOICE_ENGINE_LIVE,
  getVoiceEngine,
  isLiveVoiceEngine,
  LIVE_MODEL,
  LIVE_INPUT_SAMPLE_RATE,
  LIVE_OUTPUT_SAMPLE_RATE,
  LIVE_INPUT_MIME,
  LIVE_OUTPUT_MIME,
  LIVE_OUTPUT_FORMAT,
} from "./config.js";

export { buildLiveSystemInstruction } from "./systemPrompt.js";
export {
  LIVE_CLIENT_TYPES,
  LIVE_SERVER_TYPES,
  parseLiveClientMessage,
  serverFrame,
} from "./protocol.js";
export { GeminiLiveSession } from "./GeminiLiveSession.js";
export {
  VoiceSessionManager,
  voiceSessionManager,
} from "./VoiceSessionManager.js";
export {
  attachLiveVoiceWebSocket,
  LIVE_WS_PATH,
} from "./LiveVoiceWebSocket.js";
