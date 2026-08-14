/**
 * Duplex Voice WebSocket gateway.
 *
 * Path: /api/voice/ws?token=<JWT>&sessionId=<id>
 *
 * Client streams mic audio chunks; server returns final transcripts and
 * streams TTS PCM chunks. Interrupt cancels in-flight TTS immediately.
 * No polling — single persistent connection for the call lifetime.
 */

import { WebSocketServer } from "ws";
import { verifyAccessToken } from "../../utils/jwt.js";
import { publicFeatureError } from "../../utils/errors.js";
import User from "../../models/User.js";
import { ensureMongoReady } from "../../config/mongoReady.js";
import { voiceService } from "./VoiceService.js";
import {  parseClientMessage,
  serverFrame,
  MAX_AUDIO_CHUNK_CHARS,
  MAX_UTTERANCE_BYTES,
} from "./protocol.js";
import { logger } from "../../utils/logger.js";
import {
  isLiveVoiceEngine,
  attachLiveVoiceWebSocket,
} from "../voiceLive/index.js";

const WS_PATH = "/api/voice/ws";
const MAX_CONNECTIONS_PER_USER = 3;
const IDLE_TIMEOUT_MS = 5 * 60_000;
const PING_INTERVAL_MS = 25_000;

/** @type {WeakMap<object, ConnectionState>} */
const connectionState = new WeakMap();

/** @type {Map<string, Set<object>>} userId → sockets */
const userSockets = new Map();

/**
 * @typedef {{
 *   user: { id: string, email: string, name?: string },
 *   sessionId: string | null,
 *   audioChunks: Buffer[],
 *   audioBytes: number,
 *   mimeType: string,
 *   language: string,
 *   ttsAbort: AbortController | null,
 *   alive: boolean,
 *   lastActivity: number,
 * }} ConnectionState
 */

async function resolveUserFromToken(token) {
  console.log("[voice-ws] resolveUserFromToken: start", {
    hasToken: Boolean(token),
    tokenLength: token ? String(token).length : 0,
  });

  if (!token) {
    console.log("[voice-ws] handshake FAIL: token missing from query string");
    return null;
  }

  let claims;
  try {
    claims = await verifyAccessToken(token);
    console.log("[voice-ws] JWT verification ok", {
      email: claims?.email || null,
      purpose: claims?.purpose || null,
    });
  } catch (err) {
    console.log("[voice-ws] handshake FAIL: JWT verification failed", {
      message: err?.message || String(err),
      name: err?.name || null,
    });
    return null;
  }
  if (claims.purpose === "file") {
    console.log("[voice-ws] handshake FAIL: JWT is a file-scoped token, not a session token");
    return null;
  }

  try {
    await ensureMongoReady();
    console.log("[voice-ws] ensureMongoReady ok");
  } catch (err) {
    console.log("[voice-ws] handshake FAIL: ensureMongoReady() failed", {
      message: err?.message || String(err),
      code: err?.code || null,
    });
    return null;
  }

  const user = await User.findOne({ email: claims.email });
  if (!user) {
    console.log("[voice-ws] handshake FAIL: User.findOne returned null", {
      email: claims.email || null,
    });
    return null;
  }

  console.log("[voice-ws] resolveUserFromToken ok", {
    userId: String(user._id),
    email: user.email,
  });
  return {
    id: String(user._id),
    email: user.email,
    name: user.name || "",
  };
}

function send(ws, type, payload = {}) {
  if (ws.readyState !== 1 /* OPEN */) return;
  try {
    ws.send(serverFrame(type, payload));
  } catch (err) {
    logger.warn({ err: err.message }, "[voice-ws] send failed");
  }
}

function trackSocket(userId, ws) {
  let set = userSockets.get(userId);
  if (!set) {
    set = new Set();
    userSockets.set(userId, set);
  }
  set.add(ws);
}

function untrackSocket(userId, ws) {
  const set = userSockets.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) userSockets.delete(userId);
}

function cleanupConnection(ws) {
  const state = connectionState.get(ws);
  if (!state) return;
  state.ttsAbort?.abort();
  state.ttsAbort = null;
  state.audioChunks = [];
  state.audioBytes = 0;
  untrackSocket(state.user.id, ws);
  connectionState.delete(ws);
}

/**
 * Abort in-flight TTS on any open WS bound to this voice session.
 * Used by HTTP POST /voice/interrupt so barge-in works without a WS frame.
 * @param {string} sessionId
 * @returns {boolean}
 */
export function abortVoiceTtsForSession(sessionId) {
  if (!sessionId) return false;
  let aborted = false;
  for (const set of userSockets.values()) {
    for (const ws of set) {
      const state = connectionState.get(ws);
      if (!state || state.sessionId !== sessionId) continue;
      if (state.ttsAbort) {
        state.ttsAbort.abort();
        state.ttsAbort = null;
        aborted = true;
      }
    }
  }
  return aborted;
}

/**
 * Attach the voice WebSocket server to an existing HTTP server.
 *
 * Feature flag: VOICE_ENGINE=live routes to Gemini Live Native Audio.
 * Default VOICE_ENGINE=legacy keeps the existing STT/TTS duplex pipeline.
 *
 * @param {import('http').Server} httpServer
 * @returns {{ close: () => Promise<void>, path: string, engine?: string }}
 */
export function attachVoiceWebSocket(httpServer) {
  // Lazy import so legacy boot never loads Live modules unless selected.
  // (Dynamic import kept sync via createRequire-style would be heavier;
  // static import of the flag helper is cheap and side-effect free.)
  if (isLiveVoiceEngine()) {
    return attachLiveVoiceWebSocket(httpServer);
  }

  // Wire HTTP interrupt → cancel in-flight WS TTS for the same session.
  voiceService.setWsTtsAbortHook(abortVoiceTtsForSession);

  const wss = new WebSocketServer({
    server: httpServer,
    path: WS_PATH,
    maxPayload: 512 * 1024,
    perMessageDeflate: false,
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      const state = connectionState.get(ws);
      if (!state) {
        ws.terminate();
        continue;
      }
      if (!state.alive) {
        cleanupConnection(ws);
        ws.terminate();
        continue;
      }
      if (Date.now() - state.lastActivity > IDLE_TIMEOUT_MS) {
        send(ws, "error", {
          message: "Voice connection idle timeout.",
          code: "IDLE_TIMEOUT",
        });
        cleanupConnection(ws);
        ws.close(4000, "idle timeout");
        continue;
      }
      state.alive = false;
      try {
        ws.ping();
      } catch {
        cleanupConnection(ws);
        ws.terminate();
      }
    }
  }, PING_INTERVAL_MS);
  if (typeof heartbeat.unref === "function") heartbeat.unref();

  wss.on("connection", async (ws, req) => {
    console.log("[voice-ws] connection upgrade", {
      url: req.url || null,
      origin: req.headers?.origin || null,
    });

    let url;
    try {
      url = new URL(req.url || "", "http://localhost");
    } catch (err) {
      console.log("[voice-ws] handshake FAIL: could not parse request URL", {
        raw: req.url || null,
        message: err?.message || String(err),
      });
      ws.close(4001, "bad request");
      return;
    }

    const token =
      url.searchParams.get("token") ||
      url.searchParams.get("access_token") ||
      "";
    console.log("[voice-ws] query params", {
      hasToken: Boolean(token),
      tokenParam: Boolean(url.searchParams.get("token")),
      accessTokenParam: Boolean(url.searchParams.get("access_token")),
      sessionId: url.searchParams.get("sessionId") || null,
    });

    const user = await resolveUserFromToken(token);
    if (!user) {
      console.log("[voice-ws] closing 4401 unauthorized (resolveUserFromToken returned null)");
      ws.close(4401, "unauthorized");
      return;
    }

    const existing = userSockets.get(user.id);
    if (existing && existing.size >= MAX_CONNECTIONS_PER_USER) {
      console.log("[voice-ws] handshake FAIL: too many voice connections", {
        userId: user.id,
        open: existing.size,
        max: MAX_CONNECTIONS_PER_USER,
      });
      ws.close(4429, "too many voice connections");
      return;
    }

    console.log("[voice-ws] handshake ok", {
      userId: user.id,
      email: user.email,
      sessionId: url.searchParams.get("sessionId") || null,
    });

    /** @type {ConnectionState} */
    const state = {
      user,
      sessionId: url.searchParams.get("sessionId") || null,
      audioChunks: [],
      audioBytes: 0,
      mimeType: "audio/webm",
      language: "auto",
      ttsAbort: null,
      alive: true,
      lastActivity: Date.now(),
    };
    connectionState.set(ws, state);
    trackSocket(user.id, ws);

    // Bind / validate session if provided at connect time.
    if (state.sessionId) {
      const session = voiceService.getOwnedSession(state.sessionId, user);
      if (!session) {
        send(ws, "error", {
          message: "Voice session not found.",
          code: "SESSION_NOT_FOUND",
        });
        cleanupConnection(ws);
        ws.close(4404, "session not found");
        return;
      }
      state.language = session.language || "auto";
      send(ws, "ready", {
        session,
        capabilities: voiceService.capabilities().features,
      });
    } else {
      send(ws, "ready", {
        session: null,
        capabilities: voiceService.capabilities().features,
      });
    }

    ws.on("pong", () => {
      const s = connectionState.get(ws);
      if (s) {
        s.alive = true;
        s.lastActivity = Date.now();
      }
    });

    ws.on("message", async (data, isBinary) => {
      const s = connectionState.get(ws);
      if (!s) return;
      s.alive = true;
      s.lastActivity = Date.now();

      if (isBinary) {
        // Raw PCM/WebM binary frames append to utterance buffer.
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        if (s.audioBytes + buf.length > MAX_UTTERANCE_BYTES) {
          send(ws, "error", {
            message: "Utterance too large.",
            code: "AUDIO_TOO_LARGE",
          });
          s.audioChunks = [];
          s.audioBytes = 0;
          return;
        }
        s.audioChunks.push(buf);
        s.audioBytes += buf.length;
        return;
      }

      const text = typeof data === "string" ? data : data.toString("utf8");
      const parsed = parseClientMessage(text);
      if (!parsed.ok) {
        send(ws, "error", { message: parsed.error, code: "BAD_FRAME" });
        return;
      }

      try {
        await handleClientMessage(ws, s, parsed.msg);
      } catch (err) {
        logger.error({ err: err.message }, "[voice-ws] handler error");
        send(ws, "error", {
          message: publicFeatureError("voice", err),
          code: err.code || "VOICE_WS_ERROR",
        });
      }
    });

    ws.on("close", () => {
      cleanupConnection(ws);
    });

    ws.on("error", (err) => {
      logger.warn({ err: err.message }, "[voice-ws] socket error");
      cleanupConnection(ws);
    });
  });

  wss.on("error", (err) => {
    logger.error({ err: err.message }, "[voice-ws] server error");
  });

  logger.info(`[voice-ws] listening on ${WS_PATH} (VOICE_ENGINE=legacy)`);

  return {
    path: WS_PATH,
    engine: "legacy",
    close: () =>
      new Promise((resolve) => {
        clearInterval(heartbeat);
        for (const ws of wss.clients) {
          cleanupConnection(ws);
          try {
            ws.close(1001, "server shutting down");
          } catch {
            /* noop */
          }
        }
        wss.close(() => resolve());
      }),
  };
}

/**
 * @param {import('ws').WebSocket} ws
 * @param {ConnectionState} state
 * @param {object} msg
 */
async function handleClientMessage(ws, state, msg) {
  switch (msg.type) {
    case "ping":
      send(ws, "pong");
      return;

    case "bind": {
      const sessionId = String(msg.sessionId || "");
      const session = voiceService.getOwnedSession(sessionId, state.user);
      if (!session) {
        send(ws, "error", {
          message: "Voice session not found.",
          code: "SESSION_NOT_FOUND",
        });
        return;
      }
      state.sessionId = sessionId;
      state.language = session.language || state.language;
      send(ws, "ready", {
        session,
        capabilities: voiceService.capabilities().features,
      });
      return;
    }

    case "config": {
      if (!state.sessionId) {
        send(ws, "error", {
          message: "Bind a session before config.",
          code: "NO_SESSION",
        });
        return;
      }
      const patch = {};
      if (msg.voice) patch.voice = msg.voice;
      if (msg.speed != null) patch.speed = msg.speed;
      if (msg.language) {
        patch.language = msg.language;
        state.language = String(msg.language);
      }
      if (typeof msg.muted === "boolean") patch.muted = msg.muted;
      if (msg.mode) patch.mode = msg.mode;
      if (msg.state) patch.state = msg.state;
      if (msg.chatId !== undefined) patch.chatId = msg.chatId;
      const session = voiceService.updateOwnedSession(
        state.sessionId,
        state.user,
        patch
      );
      if (session) send(ws, "state", { session });
      return;
    }

    case "audio.start": {
      state.audioChunks = [];
      state.audioBytes = 0;
      if (typeof msg.mimeType === "string" && msg.mimeType) {
        state.mimeType = msg.mimeType.split(";")[0].trim() || "audio/webm";
      }
      if (typeof msg.language === "string" && msg.language) {
        state.language = msg.language;
      }
      if (state.sessionId) {
        voiceService.setState(state.sessionId, state.user, "listening");
        send(ws, "state", {
          session: voiceService.getOwnedSession(state.sessionId, state.user),
        });
      }
      return;
    }

    case "audio.chunk": {
      const data = msg.data;
      if (typeof data !== "string" || !data) return;
      if (data.length > MAX_AUDIO_CHUNK_CHARS) {
        send(ws, "error", {
          message: "Audio chunk too large.",
          code: "CHUNK_TOO_LARGE",
        });
        return;
      }
      const buf = Buffer.from(data, "base64");
      if (!buf.length) return;
      if (state.audioBytes + buf.length > MAX_UTTERANCE_BYTES) {
        send(ws, "error", {
          message: "Utterance too large.",
          code: "AUDIO_TOO_LARGE",
        });
        state.audioChunks = [];
        state.audioBytes = 0;
        return;
      }
      state.audioChunks.push(buf);
      state.audioBytes += buf.length;

      // Optional client-driven partial hint (browser STT mirrored over WS).
      if (typeof msg.partial === "string" && msg.partial.trim()) {
        send(ws, "transcript.partial", { text: msg.partial.trim() });
      }
      return;
    }

    case "audio.end": {
      await finalizeUtterance(ws, state, msg);
      return;
    }

    case "tts": {
      await streamTts(ws, state, msg);
      return;
    }

    case "interrupt": {
      state.ttsAbort?.abort();
      state.ttsAbort = null;
      state.audioChunks = [];
      state.audioBytes = 0;
      if (state.sessionId) {
        const session = voiceService.interrupt(state.sessionId, state.user);
        send(ws, "interrupted", { session });
      } else {
        send(ws, "interrupted", { session: null });
      }
      return;
    }

    case "close": {
      cleanupConnection(ws);
      ws.close(1000, "client close");
      return;
    }

    default:
      send(ws, "error", {
        message: `Unhandled type: ${msg.type}`,
        code: "BAD_FRAME",
      });
  }
}

async function finalizeUtterance(ws, state, msg) {
  // Allow final blob in audio.end for clients that buffer locally.
  if (typeof msg.data === "string" && msg.data) {
    const buf = Buffer.from(msg.data, "base64");
    if (buf.length) {
      state.audioChunks.push(buf);
      state.audioBytes += buf.length;
    }
  }
  if (typeof msg.mimeType === "string" && msg.mimeType) {
    state.mimeType = msg.mimeType.split(";")[0].trim() || state.mimeType;
  }

  const buffer = Buffer.concat(state.audioChunks);
  state.audioChunks = [];
  state.audioBytes = 0;

  if (buffer.length < 400) {
    send(ws, "error", {
      message: "Audio too short to transcribe.",
      code: "AUDIO_TOO_SHORT",
    });
    return;
  }

  try {
    const result = await voiceService.speechToText({
      buffer,
      mimeType: state.mimeType,
      languageHint: msg.language || state.language,
      sessionId: state.sessionId,
      user: state.user,
    });

    send(ws, "transcript.final", {
      transcript: result.transcript,
      language: result.language,
      confidence: result.confidence,
      sessionId: result.sessionId,
      meta: result.meta,
    });
  } catch (err) {
    send(ws, "error", {
      message: publicFeatureError("voice", err),
      code: err.code || "STT_FAILED",
    });
  }
}

async function streamTts(ws, state, msg) {
  // Cancel any in-flight TTS (barge-in / new speak request).
  state.ttsAbort?.abort();
  const controller = new AbortController();
  state.ttsAbort = controller;

  const text = typeof msg.text === "string" ? msg.text : "";
  if (!text.trim()) {
    send(ws, "error", { message: "text is required.", code: "MISSING_TEXT" });
    return;
  }

  for await (const event of voiceService.textToSpeechStream({
    text,
    voice: msg.voice,
    speed: msg.speed,
    sessionId: state.sessionId,
    user: state.user,
    signal: controller.signal,
  })) {
    if (controller.signal.aborted) break;
    if (event.type === "meta") {
      send(ws, "tts.meta", event);
    } else if (event.type === "audio") {
      send(ws, "tts.audio", {
        data: event.data,
        offset: event.offset,
        byteLength: event.byteLength,
      });
    } else if (event.type === "done") {
      send(ws, "tts.done", { byteLength: event.byteLength });
    } else if (event.type === "error") {
      send(ws, "error", {
        message: event.message,
        code: event.code || "TTS_FAILED",
      });
    }
  }

  if (state.ttsAbort === controller) state.ttsAbort = null;
}

export { WS_PATH };
