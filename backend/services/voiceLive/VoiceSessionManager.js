/**
 * VoiceSessionManager — owns Gemini Live Native Audio sessions for the
 * Live voice engine.
 *
 * Maps VANI voice session IDs (from legacy voiceSession store) to active
 * GeminiLiveSession instances. Browser WebSocket bridges register here;
 * legacy VoiceService / STT / TTS are untouched.
 */

import {
  createSession,
  getSession,
  updateSession,
  endSession,
} from "../voiceSession/index.js";
import { logger } from "../../utils/logger.js";
import { GeminiLiveSession } from "./GeminiLiveSession.js";
import {
  LIVE_MAX_SESSIONS_PER_USER,
  LIVE_MODEL,
  getVoiceEngine,
  isLiveVoiceEngine,
} from "./config.js";

/**
 * @typedef {{
 *   id: string,
 *   userId: string,
 *   userEmail: string,
 *   voiceSessionId: string,
 *   live: GeminiLiveSession,
 *   createdAt: number,
 *   lastActivity: number,
 * }} ManagedLiveSession
 */

export class VoiceSessionManager {
  constructor(deps = {}) {
    /** @type {Map<string, ManagedLiveSession>} id → managed */
    this._byId = new Map();
    /** @type {Map<string, string>} voiceSessionId → managed id */
    this._byVoiceSession = new Map();
    /** @type {Map<string, Set<string>>} userId → managed ids */
    this._byUser = new Map();
    this._createLive =
      deps.createLiveSession ||
      ((opts) => new GeminiLiveSession(opts));
    this._createVoiceSession = deps.createSession || createSession;
    this._getVoiceSession = deps.getSession || getSession;
    this._updateVoiceSession = deps.updateSession || updateSession;
    this._endVoiceSession = deps.endSession || endSession;
  }

  engine() {
    return getVoiceEngine();
  }

  isLive() {
    return isLiveVoiceEngine();
  }

  capabilities() {
    const live = this.isLive();
    return {
      ok: true,
      engine: this.engine(),
      features: {
        engine: this.engine(),
        liveNativeAudio: live,
        stt: !live,
        tts: !live,
        streamingTts: true,
        streamingStt: live,
        websocket: true,
        interrupt: true,
        realtimePcm: live,
        modes: ["push-to-talk", "hands-free"],
        languages: ["en", "hi", "hi-en", "auto"],
        model: live ? LIVE_MODEL : null,
      },
    };
  }

  /**
   * Ensure a VANI voice session exists, then open Gemini Live against it.
   *
   * @param {{
   *   userId: string,
   *   userEmail: string,
   *   userName?: string,
   *   voiceSessionId?: string | null,
   *   chatId?: string | null,
   *   projectId?: string | null,
   *   voice?: string,
   *   mode?: string,
   *   language?: string,
   *   onEvent?: (event: object) => void,
   * }} input
   */
  async start(input) {
    const userId = String(input.userId || "");
    if (!userId) {
      const err = new Error("userId is required.");
      err.code = "MISSING_USER";
      throw err;
    }

    this._enforceUserLimit(userId);

    let voiceSession = null;
    if (input.voiceSessionId) {
      voiceSession = this._getVoiceSession(input.voiceSessionId);
      if (
        !voiceSession ||
        (String(voiceSession.userId) !== userId &&
          String(voiceSession.userEmail) !== String(input.userEmail || ""))
      ) {
        const err = new Error("Voice session not found.");
        err.code = "SESSION_NOT_FOUND";
        throw err;
      }
      // Tear down any existing Live link for this voice session.
      const existingId = this._byVoiceSession.get(voiceSession.id);
      if (existingId) await this.stop(existingId);
    } else {
      voiceSession = this._createVoiceSession({
        userId,
        userEmail: input.userEmail,
        chatId: input.chatId,
        projectId: input.projectId,
        mode: input.mode,
        voice: input.voice,
        language: input.language,
      });
    }

    const managedId = `live_${voiceSession.id}`;
    const voiceName = input.voice || voiceSession.voice || null;

    const live = this._createLive({
      voice: voiceName,
      userName: input.userName || "",
      onEvent: (event) => {
        const managed = this._byId.get(managedId);
        if (managed) managed.lastActivity = Date.now();
        if (typeof input.onEvent === "function") {
          input.onEvent(event);
        }
      },
    });

    await live.connect();

    /** @type {ManagedLiveSession} */
    const managed = {
      id: managedId,
      userId,
      userEmail: String(input.userEmail || ""),
      voiceSessionId: voiceSession.id,
      live,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    this._byId.set(managedId, managed);
    this._byVoiceSession.set(voiceSession.id, managedId);
    let set = this._byUser.get(userId);
    if (!set) {
      set = new Set();
      this._byUser.set(userId, set);
    }
    set.add(managedId);

    this._updateVoiceSession(voiceSession.id, {
      state: "listening",
      voice: voiceName || voiceSession.voice,
    });

    logger.info(
      { managedId, voiceSessionId: voiceSession.id, userId },
      "[voice-live] session started"
    );

    return {
      id: managedId,
      voiceSession: this._getVoiceSession(voiceSession.id),
      model: LIVE_MODEL,
      engine: VOICE_ENGINE_LABEL(),
    };
  }

  /**
   * @param {string} managedId
   * @param {{ id?: string, email?: string }} user
   */
  getOwned(managedId, user) {
    const managed = this._byId.get(managedId);
    if (!managed || !user) return null;
    if (
      String(managed.userId) !== String(user.id) &&
      String(managed.userEmail) !== String(user.email)
    ) {
      return null;
    }
    return managed;
  }

  /** Lookup by VANI voice session id. */
  getByVoiceSessionId(voiceSessionId) {
    const id = this._byVoiceSession.get(voiceSessionId);
    return id ? this._byId.get(id) || null : null;
  }

  /**
   * Forward PCM to the Live session.
   * @param {string} managedId
   * @param {Buffer | string} pcm
   * @param {{ mimeType?: string }} [opts]
   */
  sendAudio(managedId, pcm, opts) {
    const managed = this._byId.get(managedId);
    if (!managed) return false;
    managed.lastActivity = Date.now();
    managed.live.sendAudio(pcm, opts);
    return true;
  }

  sendAudioStreamEnd(managedId) {
    const managed = this._byId.get(managedId);
    if (!managed) return false;
    managed.live.sendAudioStreamEnd();
    return true;
  }

  sendText(managedId, text) {
    const managed = this._byId.get(managedId);
    if (!managed) return false;
    managed.lastActivity = Date.now();
    managed.live.sendText(text);
    return true;
  }

  interrupt(managedId) {
    const managed = this._byId.get(managedId);
    if (!managed) return false;
    managed.live.interrupt();
    this._updateVoiceSession(managed.voiceSessionId, { state: "listening" });
    return true;
  }

  async stop(managedId, { endVoiceSession = false } = {}) {
    const managed = this._byId.get(managedId);
    if (!managed) return null;

    try {
      managed.live.close();
    } catch (err) {
      logger.warn({ err: err.message }, "[voice-live] close error");
    }

    this._byId.delete(managedId);
    this._byVoiceSession.delete(managed.voiceSessionId);
    const set = this._byUser.get(managed.userId);
    if (set) {
      set.delete(managedId);
      if (set.size === 0) this._byUser.delete(managed.userId);
    }

    if (endVoiceSession) {
      this._endVoiceSession(managed.voiceSessionId);
    } else {
      this._updateVoiceSession(managed.voiceSessionId, { state: "idle" });
    }

    logger.info({ managedId }, "[voice-live] session stopped");
    return managed;
  }

  async stopByVoiceSession(voiceSessionId, opts) {
    const id = this._byVoiceSession.get(voiceSessionId);
    if (!id) return null;
    return this.stop(id, opts);
  }

  async shutdown() {
    const ids = [...this._byId.keys()];
    await Promise.allSettled(ids.map((id) => this.stop(id)));
  }

  sessionCount() {
    return this._byId.size;
  }

  _enforceUserLimit(userId) {
    const set = this._byUser.get(userId);
    if (!set || set.size < LIVE_MAX_SESSIONS_PER_USER) return;
    const err = new Error("Too many Live voice sessions for this user.");
    err.code = "LIVE_SESSION_LIMIT";
    throw err;
  }
}

function VOICE_ENGINE_LABEL() {
  return getVoiceEngine();
}

/** Process-wide singleton used by the Live WebSocket gateway. */
export const voiceSessionManager = new VoiceSessionManager();
