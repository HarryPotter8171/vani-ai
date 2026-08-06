import { randomUUID } from "crypto";
import {
  DEFAULT_VOICE_MODE,
  SESSION_STATES,
  SESSION_TTL_MS,
  VOICE_MODES,
} from "./config.js";
import { DEFAULT_VOICE, resolveVoice, clampSpeed } from "../textToSpeech/voices.js";

/** @typedef {{
 *   id: string,
 *   userId: string,
 *   userEmail: string,
 *   chatId: string | null,
 *   projectId: string | null,
 *   mode: string,
 *   state: string,
 *   voice: string,
 *   speed: number,
 *   language: string,
 *   muted: boolean,
 *   createdAt: number,
 *   updatedAt: number,
 *   expiresAt: number,
 *   turnCount: number,
 *   lastTranscript: string | null,
 *   lastError: string | null,
 * }} VoiceSession */

/** @type {Map<string, VoiceSession>} */
const sessions = new Map();

let sweepTimer = null;

function ensureSweep() {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (session.expiresAt <= now || session.state === "ended") {
        sessions.delete(id);
      }
    }
    if (sessions.size === 0 && sweepTimer) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
  }, 60_000);
  if (typeof sweepTimer.unref === "function") sweepTimer.unref();
}

function touch(session) {
  const now = Date.now();
  session.updatedAt = now;
  session.expiresAt = now + SESSION_TTL_MS;
  return session;
}

/**
 * @param {{
 *   userId?: string,
 *   userEmail?: string,
 *   chatId?: string | null,
 *   projectId?: string | null,
 *   mode?: string,
 *   voice?: string,
 *   speed?: number,
 *   language?: string,
 * }} input
 */
export function createSession(input = {}) {
  const now = Date.now();
  const mode = VOICE_MODES.includes(input.mode) ? input.mode : DEFAULT_VOICE_MODE;

  /** @type {VoiceSession} */
  const session = {
    id: randomUUID(),
    userId: input.userId ? String(input.userId) : "",
    userEmail: String(input.userEmail || "").toLowerCase().trim(),
    chatId: input.chatId || null,
    projectId: input.projectId || null,
    mode,
    state: "idle",
    voice: resolveVoice(input.voice) || DEFAULT_VOICE,
    speed: clampSpeed(input.speed),
    language: input.language || "auto",
    muted: false,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + SESSION_TTL_MS,
    turnCount: 0,
    lastTranscript: null,
    lastError: null,
  };

  sessions.set(session.id, session);
  ensureSweep();
  return { ...session };
}

/**
 * @param {string} sessionId
 * @returns {VoiceSession | null}
 */
export function getSession(sessionId) {
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.expiresAt <= Date.now() || session.state === "ended") {
    sessions.delete(sessionId);
    return null;
  }
  return touch(session);
}

/**
 * @param {string} sessionId
 * @param {Partial<VoiceSession>} patch
 */
export function updateSession(sessionId, patch = {}) {
  const session = getSession(sessionId);
  if (!session) return null;

  if (patch.mode && VOICE_MODES.includes(patch.mode)) session.mode = patch.mode;
  if (patch.state && SESSION_STATES.includes(patch.state)) session.state = patch.state;
  if (patch.voice) session.voice = resolveVoice(patch.voice);
  if (patch.speed != null) session.speed = clampSpeed(patch.speed);
  if (patch.language) session.language = String(patch.language);
  if (typeof patch.muted === "boolean") session.muted = patch.muted;
  if (patch.chatId !== undefined) session.chatId = patch.chatId || null;
  if (patch.projectId !== undefined) session.projectId = patch.projectId || null;
  if (patch.lastTranscript !== undefined) session.lastTranscript = patch.lastTranscript;
  if (patch.lastError !== undefined) session.lastError = patch.lastError;
  if (typeof patch.turnCount === "number") session.turnCount = patch.turnCount;

  return { ...touch(session) };
}

/**
 * Record a completed user turn on the session.
 * @param {string} sessionId
 * @param {string} transcript
 */
export function recordTurn(sessionId, transcript) {
  const session = getSession(sessionId);
  if (!session) return null;
  session.turnCount += 1;
  session.lastTranscript = transcript;
  session.lastError = null;
  session.state = "processing";
  return { ...touch(session) };
}

/**
 * Soft-end a session and remove it from memory.
 * @param {string} sessionId
 */
export function endSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.state = "ended";
  sessions.delete(sessionId);
  return {
    id: session.id,
    state: "ended",
    turnCount: session.turnCount,
    endedAt: Date.now(),
  };
}

/** Test / diagnostics helper. */
export function sessionCount() {
  return sessions.size;
}
