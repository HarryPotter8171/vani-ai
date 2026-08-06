/**
 * VoiceService — production orchestration for VANI Voice AI.
 *
 * Owns session lifecycle, STT, streaming TTS, interrupt, and ownership checks.
 * Used by HTTP controllers and the duplex WebSocket gateway.
 * Chat/tool calling stays on the existing /api/chat SSE path (client sends
 * transcripts via sendMessage) so memory + tools remain shared with text chat.
 */

import {
  createSession,
  getSession,
  updateSession,
  recordTurn,
  endSession,
  sessionCount,
} from "../voiceSession/index.js";
import { transcribeAudio } from "../speechToText/index.js";
import { sanitizeIdentityResponse } from "../identity/IdentityGuard.js";
import {
  TTS_VOICES,
  DEFAULT_VOICE,
  synthesizeSpeech,
  synthesizeSpeechStream,
  sanitizeForSpeech,
} from "../textToSpeech/index.js";
import { getVoiceEngine, isLiveVoiceEngine, LIVE_MODEL } from "../voiceLive/config.js";

export class VoiceService {
  constructor(deps = {}) {
    this._transcribe = deps.transcribe || transcribeAudio;
    this._synthesize = deps.synthesize || synthesizeSpeech;
    this._synthesizeStream = deps.synthesizeStream || synthesizeSpeechStream;
    this._createSession = deps.createSession || createSession;
    this._getSession = deps.getSession || getSession;
    this._updateSession = deps.updateSession || updateSession;
    this._recordTurn = deps.recordTurn || recordTurn;
    this._endSession = deps.endSession || endSession;
    this._sessionCount = deps.sessionCount || sessionCount;
    /** Optional hook set by VoiceWebSocket to abort in-flight WS TTS. */
    this._abortWsTts = deps.abortWsTts || null;
  }

  /**
   * Register a callback that aborts duplex-WS TTS for a session id.
   * Avoids circular imports between VoiceService and VoiceWebSocket.
   * @param {(sessionId: string) => boolean} fn
   */
  setWsTtsAbortHook(fn) {
    this._abortWsTts = typeof fn === "function" ? fn : null;
  }

  listVoices() {
    return { voices: TTS_VOICES, defaultVoice: DEFAULT_VOICE };
  }

  capabilities() {
    const live = isLiveVoiceEngine();
    return {
      ok: true,
      engine: getVoiceEngine(),
      features: {
        stt: !live,
        tts: !live,
        streamingTts: true,
        // Legacy server STT is utterance-final; Live Gemini provides streaming STT.
        // Browser Web Speech may still stream partials on the client in either mode.
        streamingStt: live,
        websocket: true,
        interrupt: true,
        modes: ["push-to-talk", "hands-free"],
        languages: ["en", "hi", "hi-en", "auto"],
        tools: !live,
        memory: !live,
        engine: getVoiceEngine(),
        liveNativeAudio: live,
        realtimePcm: live,
        model: live ? LIVE_MODEL : null,
      },
    };
  }

  /**
   * @param {{ userId: string, userEmail: string } & Record<string, unknown>} input
   */
  startSession(input) {
    const session = this._createSession({
      userId: input.userId,
      userEmail: input.userEmail,
      chatId: typeof input.chatId === "string" ? input.chatId : null,
      projectId: typeof input.projectId === "string" ? input.projectId : null,
      mode: input.mode,
      voice: input.voice,
      speed: input.speed,
      language: input.language,
    });
    return {
      session,
      voices: TTS_VOICES,
      defaults: { voice: DEFAULT_VOICE, speed: 1, mode: session.mode },
    };
  }

  getSession(sessionId) {
    return this._getSession(sessionId);
  }

  /**
   * @param {object} session
   * @param {{ id?: string, email?: string }} user
   */
  assertOwner(session, user) {
    if (!session || !user) return false;
    const owner = session.userId || session.userEmail;
    if (!owner) return false;
    return (
      String(owner) === String(user.id) ||
      String(session.userEmail) === String(user.email)
    );
  }

  getOwnedSession(sessionId, user) {
    const session = this._getSession(sessionId);
    if (!session || !this.assertOwner(session, user)) return null;
    return session;
  }

  updateOwnedSession(sessionId, user, patch) {
    const session = this.getOwnedSession(sessionId, user);
    if (!session) return null;
    return this._updateSession(sessionId, patch);
  }

  endOwnedSession(sessionId, user) {
    const session = this.getOwnedSession(sessionId, user);
    if (!session) return null;
    return this._endSession(sessionId);
  }

  /**
   * Speech-to-text with optional session association.
   * @param {{
   *   buffer: Buffer,
   *   mimeType?: string,
   *   languageHint?: string,
   *   sessionId?: string | null,
   *   user: { id: string, email?: string },
   * }} input
   */
  async speechToText(input) {
    const { buffer, mimeType, languageHint, sessionId, user } = input;
    let session = null;

    if (sessionId) {
      session = this.getOwnedSession(sessionId, user);
      if (!session) {
        const err = new Error("Voice session not found.");
        err.status = 404;
        err.code = "SESSION_NOT_FOUND";
        throw err;
      }
      this._updateSession(sessionId, { state: "processing" });
    }

    const result = await this._transcribe({
      buffer,
      mimeType: mimeType || "audio/webm",
      languageHint: languageHint || session?.language || "auto",
    });

    if (sessionId && result.transcript) {
      this._recordTurn(sessionId, result.transcript);
    } else if (sessionId) {
      this._updateSession(sessionId, {
        state: "listening",
        lastError: "Empty transcript",
      });
    }

    return {
      transcript: result.transcript,
      partial: false,
      final: true,
      language: result.language,
      confidence: result.confidence,
      sessionId: sessionId || null,
      meta: {
        model: result.model,
        bytes: result.bytes,
        mimeType: result.mimeType,
      },
    };
  }

  /**
   * One-shot TTS.
   */
  async textToSpeech(input) {
    const { text, voice, speed, sessionId, user } = input;
    if (!text || typeof text !== "string") {
      const err = new Error("text is required.");
      err.status = 400;
      err.code = "MISSING_TEXT";
      throw err;
    }

    let session = null;
    if (sessionId) {
      session = this.getOwnedSession(sessionId, user);
      if (!session) {
        const err = new Error("Voice session not found.");
        err.status = 404;
        err.code = "SESSION_NOT_FOUND";
        throw err;
      }
    }

    // Identity Guard before TTS — Voice must never speak provider/model claims.
    const identitySafe = sanitizeIdentityResponse(text, input.userMessage || "");
    const clean = sanitizeForSpeech(identitySafe, input.userMessage || "");
    if (!clean) {
      const err = new Error("Nothing speakable in text.");
      err.status = 400;
      err.code = "EMPTY_TEXT";
      throw err;
    }

    if (sessionId) this._updateSession(sessionId, { state: "speaking" });

    try {
      const result = await this._synthesize({
        text: clean,
        voice: voice || session?.voice,
        speed: speed ?? session?.speed ?? 1,
      });
      if (sessionId) this._updateSession(sessionId, { state: "idle" });
      return result;
    } catch (err) {
      if (sessionId) {
        this._updateSession(sessionId, {
          state: "idle",
          lastError: err.message,
        });
      }
      throw err;
    }
  }

  /**
   * Streaming TTS generator (SSE / WebSocket).
   * @yields {{ type: string, ... }}
   */
  async *textToSpeechStream(input) {
    const { text, voice, speed, sessionId, user, signal } = input;
    if (!text || typeof text !== "string") {
      yield { type: "error", message: "text is required.", code: "MISSING_TEXT" };
      return;
    }

    let session = null;
    if (sessionId) {
      session = this.getOwnedSession(sessionId, user);
      if (!session) {
        yield {
          type: "error",
          message: "Voice session not found.",
          code: "SESSION_NOT_FOUND",
        };
        return;
      }
    }

    // Identity Guard before streaming TTS (HTTP SSE + WebSocket).
    const identitySafe = sanitizeIdentityResponse(text, input.userMessage || "");
    const clean = sanitizeForSpeech(identitySafe, input.userMessage || "");
    if (!clean) {
      yield {
        type: "error",
        message: "Nothing speakable in text.",
        code: "EMPTY_TEXT",
      };
      return;
    }

    if (sessionId) this._updateSession(sessionId, { state: "speaking" });

    try {
      for await (const event of this._synthesizeStream({
        text: clean,
        voice: voice || session?.voice,
        speed: speed ?? session?.speed ?? 1,
        signal,
      })) {
        if (signal?.aborted) break;
        yield event;
      }
      if (sessionId && !signal?.aborted) {
        this._updateSession(sessionId, { state: "idle" });
      }
    } catch (err) {
      if (sessionId) {
        this._updateSession(sessionId, {
          state: "idle",
          lastError: err?.message,
        });
      }
      yield {
        type: "error",
        message: err?.message || "Speech synthesis failed.",
        code: err?.code || "TTS_FAILED",
      };
    }
  }

  interrupt(sessionId, user) {
    const session = this.getOwnedSession(sessionId, user);
    if (!session) return null;
    // Also cancel any in-flight duplex WS TTS for this session.
    try {
      this._abortWsTts?.(sessionId);
    } catch {
      /* noop */
    }
    return this._updateSession(sessionId, {
      state: "listening",
      lastError: null,
    });
  }

  setState(sessionId, user, state) {
    return this.updateOwnedSession(sessionId, user, { state });
  }

  activeSessionCount() {
    return this._sessionCount();
  }
}

/** Shared singleton used by HTTP + WebSocket. */
export const voiceService = new VoiceService();
