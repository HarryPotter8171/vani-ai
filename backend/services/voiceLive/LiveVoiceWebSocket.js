/**
 * Live Voice WebSocket gateway.
 *
 * Path: /api/voice/ws?token=<JWT>&sessionId=<id>  (same path as legacy)
 *
 * When VOICE_ENGINE=live, browser PCM frames are forwarded to Gemini Live
 * via VoiceSessionManager, and Live audio/transcripts stream back.
 *
 * Auth / connection limits mirror the legacy gateway so ops stay consistent.
 */

import { WebSocketServer } from "ws";
import { verifyAccessToken } from "../../utils/jwt.js";
import { publicFeatureError } from "../../utils/errors.js";
import User from "../../models/User.js";
import { ensureMongoReady } from "../../config/mongoReady.js";
import { voiceService } from "../voice/VoiceService.js";
import { logger } from "../../utils/logger.js";
import { voiceSessionManager } from "./VoiceSessionManager.js";
import {
  parseLiveClientMessage,
  serverFrame,
  LIVE_MAX_AUDIO_CHUNK_CHARS,
} from "./protocol.js";
import {
  LIVE_INPUT_MIME,
  LIVE_OUTPUT_MIME,
  LIVE_OUTPUT_SAMPLE_RATE,
  LIVE_OUTPUT_FORMAT,
  LIVE_IDLE_TIMEOUT_MS,
  LIVE_MODEL,
} from "./config.js";

const WS_PATH = "/api/voice/ws";
const MAX_CONNECTIONS_PER_USER = 3;
const PING_INTERVAL_MS = 25_000;

/** @type {WeakMap<object, LiveConnectionState>} */
const connectionState = new WeakMap();

/** @type {Map<string, Set<object>>} */
const userSockets = new Map();

/**
 * @typedef {{
 *   user: { id: string, email: string, name?: string },
 *   sessionId: string | null,
 *   managedId: string | null,
 *   mimeType: string,
 *   alive: boolean,
 *   lastActivity: number,
 *   turnAudioBytes: number,
 * }} LiveConnectionState
 */

async function resolveUserFromToken(token) {
  console.log("[voice-live-ws] resolveUserFromToken: start", {
    hasToken: Boolean(token),
    tokenLength: token ? String(token).length : 0,
  });

  if (!token) {
    console.log("[voice-live-ws] handshake FAIL: token missing from query string");
    return null;
  }

  let claims;
  try {
    claims = await verifyAccessToken(token);
    console.log("[voice-live-ws] JWT verification ok", {
      email: claims?.email || null,
      purpose: claims?.purpose || null,
    });
  } catch (err) {
    console.log("[voice-live-ws] handshake FAIL: JWT verification failed", {
      message: err?.message || String(err),
      name: err?.name || null,
    });
    return null;
  }
  if (claims.purpose === "file") {
    console.log("[voice-live-ws] handshake FAIL: JWT is a file-scoped token, not a session token");
    return null;
  }

  try {
    await ensureMongoReady();
    console.log("[voice-live-ws] ensureMongoReady ok");
  } catch (err) {
    console.log("[voice-live-ws] handshake FAIL: ensureMongoReady() failed", {
      message: err?.message || String(err),
      code: err?.code || null,
    });
    return null;
  }

  const user = await User.findOne({ email: claims.email });
  if (!user) {
    console.log("[voice-live-ws] handshake FAIL: User.findOne returned null", {
      email: claims.email || null,
    });
    return null;
  }

  console.log("[voice-live-ws] resolveUserFromToken ok", {
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
    logger.warn({ err: err.message }, "[voice-live-ws] send failed");
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

async function cleanupConnection(ws) {
  const state = connectionState.get(ws);
  if (!state) return;
  if (state.managedId) {
    try {
      await voiceSessionManager.stop(state.managedId);
    } catch (err) {
      logger.warn({ err: err.message }, "[voice-live-ws] stop on cleanup failed");
    }
    state.managedId = null;
  }
  untrackSocket(state.user.id, ws);
  connectionState.delete(ws);
}

/**
 * Forward Gemini Live events to the browser WS using a protocol close to
 * legacy (tts.* / transcript.*) so a future frontend can share playback.
 * @param {import('ws').WebSocket} ws
 * @param {LiveConnectionState} state
 * @param {object} event
 */
function forwardLiveEvent(ws, state, event) {
  switch (event.type) {
    case "setup":
      send(ws, "live.ready", {
        model: event.model || LIVE_MODEL,
        geminiSessionId: event.sessionId || null,
        inputMime: LIVE_INPUT_MIME,
        outputMime: LIVE_OUTPUT_MIME,
        outputFormat: LIVE_OUTPUT_FORMAT,
        sampleRate: LIVE_OUTPUT_SAMPLE_RATE,
      });
      return;

    case "audio":
      if (state.turnAudioBytes === 0) {
        send(ws, "tts.meta", {
          mimeType: event.mimeType || LIVE_OUTPUT_MIME,
          format: event.format || LIVE_OUTPUT_FORMAT,
          sampleRate: event.sampleRate || LIVE_OUTPUT_SAMPLE_RATE,
          engine: "live",
        });
      }
      state.turnAudioBytes += event.byteLength || 0;
      send(ws, "tts.audio", {
        data: event.data,
        offset: event.offset,
        byteLength: event.byteLength,
      });
      return;

    case "transcript.input":
      send(ws, event.interim ? "transcript.partial" : "transcript.final", {
        text: event.text,
        transcript: event.text,
        interim: !!event.interim,
        engine: "live",
      });
      return;

    case "transcript.output":
      send(ws, "transcript.output", {
        text: event.text,
        engine: "live",
      });
      return;

    case "interrupted":
      state.turnAudioBytes = 0;
      send(ws, "interrupted", {
        session: state.sessionId
          ? voiceService.getOwnedSession(state.sessionId, state.user)
          : null,
      });
      return;

    case "turnComplete":
      send(ws, "tts.done", {
        byteLength: event.byteLength || state.turnAudioBytes,
        engine: "live",
      });
      state.turnAudioBytes = 0;
      if (state.sessionId) {
        voiceService.setState?.(state.sessionId, state.user, "listening");
        send(ws, "state", {
          session: voiceService.getOwnedSession(state.sessionId, state.user),
        });
      }
      return;

    case "error":
      send(ws, "error", {
        message: event.message || "Live session error.",
        code: event.code || "LIVE_ERROR",
      });
      // goAway requires a fresh Live session — release quota immediately.
      if (event.code === "LIVE_GO_AWAY" && state.managedId) {
        const id = state.managedId;
        state.managedId = null;
        void voiceSessionManager.stop(id).catch((err) => {
          logger.warn(
            { err: err.message },
            "[voice-live-ws] stop after goAway failed"
          );
        });
      }
      return;

    case "closed":
      send(ws, "live.closed", { reason: event.reason || "closed" });
      // Gemini closed the Live socket — drop manager entry so limits stay accurate.
      if (state.managedId) {
        const id = state.managedId;
        state.managedId = null;
        void voiceSessionManager.stop(id).catch((err) => {
          logger.warn(
            { err: err.message },
            "[voice-live-ws] stop after gemini closed failed"
          );
        });
      }
      return;

    default:
      break;
  }
}

/**
 * Attach the Live voice WebSocket server to an existing HTTP server.
 * @param {import('http').Server} httpServer
 */
export function attachLiveVoiceWebSocket(httpServer) {
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
      if (Date.now() - state.lastActivity > LIVE_IDLE_TIMEOUT_MS) {
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
    console.log("[voice-live-ws] connection upgrade", {
      url: req.url || null,
      origin: req.headers?.origin || null,
    });

    let url;
    try {
      url = new URL(req.url || "", "http://localhost");
    } catch (err) {
      console.log("[voice-live-ws] handshake FAIL: could not parse request URL", {
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
    console.log("[voice-live-ws] query params", {
      hasToken: Boolean(token),
      tokenParam: Boolean(url.searchParams.get("token")),
      accessTokenParam: Boolean(url.searchParams.get("access_token")),
      sessionId: url.searchParams.get("sessionId") || null,
    });

    const user = await resolveUserFromToken(token);
    if (!user) {
      console.log("[voice-live-ws] closing 4401 unauthorized (resolveUserFromToken returned null)");
      ws.close(4401, "unauthorized");
      return;
    }

    const existing = userSockets.get(user.id);
    if (existing && existing.size >= MAX_CONNECTIONS_PER_USER) {
      console.log("[voice-live-ws] handshake FAIL: too many voice connections", {
        userId: user.id,
        open: existing.size,
        max: MAX_CONNECTIONS_PER_USER,
      });
      ws.close(4429, "too many voice connections");
      return;
    }

    console.log("[voice-live-ws] handshake ok", {
      userId: user.id,
      email: user.email,
      sessionId: url.searchParams.get("sessionId") || null,
    });

    /** @type {LiveConnectionState} */
    const state = {
      user,
      sessionId: url.searchParams.get("sessionId") || null,
      managedId: null,
      mimeType: LIVE_INPUT_MIME,
      alive: true,
      lastActivity: Date.now(),
      turnAudioBytes: 0,
    };
    connectionState.set(ws, state);
    trackSocket(user.id, ws);

    const caps = voiceSessionManager.capabilities().features;

    if (state.sessionId) {
      const session = voiceService.getOwnedSession(state.sessionId, user);
      if (!session) {
        send(ws, "error", {
          message: "Voice session not found.",
          code: "SESSION_NOT_FOUND",
        });
        await cleanupConnection(ws);
        ws.close(4404, "session not found");
        return;
      }
      send(ws, "ready", {
        session,
        engine: "live",
        capabilities: caps,
      });
    } else {
      send(ws, "ready", {
        session: null,
        engine: "live",
        capabilities: caps,
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
        if (!s.managedId) {
          send(ws, "error", {
            message: "Start Live session before sending audio.",
            code: "NO_LIVE_SESSION",
          });
          return;
        }
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        voiceSessionManager.sendAudio(s.managedId, buf, {
          mimeType: s.mimeType,
        });
        return;
      }

      const text = typeof data === "string" ? data : data.toString("utf8");
      const parsed = parseLiveClientMessage(text);
      if (!parsed.ok) {
        send(ws, "error", { message: parsed.error, code: "BAD_FRAME" });
        return;
      }

      try {
        await handleLiveClientMessage(ws, s, parsed.msg);
      } catch (err) {
        logger.error({ err: err.message }, "[voice-live-ws] handler error");
        send(ws, "error", {
          message: publicFeatureError("voice", err),
          code: err.code || "VOICE_LIVE_WS_ERROR",
        });
      }
    });

    ws.on("close", () => {
      cleanupConnection(ws);
    });

    ws.on("error", (err) => {
      logger.warn({ err: err.message }, "[voice-live-ws] socket error");
      cleanupConnection(ws);
    });
  });

  wss.on("error", (err) => {
    logger.error({ err: err.message }, "[voice-live-ws] server error");
  });

  logger.info(`[voice-live-ws] listening on ${WS_PATH} (VOICE_ENGINE=live)`);

  return {
    path: WS_PATH,
    engine: "live",
    close: async () => {
      clearInterval(heartbeat);
      for (const ws of wss.clients) {
        await cleanupConnection(ws);
        try {
          ws.close(1001, "server shutting down");
        } catch {
          /* noop */
        }
      }
      await voiceSessionManager.shutdown();
      await new Promise((resolve) => wss.close(() => resolve()));
    },
  };
}

/**
 * @param {import('ws').WebSocket} ws
 * @param {LiveConnectionState} state
 * @param {object} msg
 */
async function handleLiveClientMessage(ws, state, msg) {
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
      send(ws, "ready", {
        session,
        engine: "live",
        capabilities: voiceSessionManager.capabilities().features,
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
      if (msg.language) patch.language = msg.language;
      if (typeof msg.muted === "boolean") patch.muted = msg.muted;
      if (msg.mode) patch.mode = msg.mode;
      if (msg.state) patch.state = msg.state;
      if (msg.chatId !== undefined) patch.chatId = msg.chatId;
      const session = voiceService.updateOwnedSession(
        state.sessionId,
        state.user,
        patch
      );
      if (session) send(ws, "state", { session, engine: "live" });
      return;
    }

    case "live.start": {
      await startLiveForConnection(ws, state, msg);
      return;
    }

    case "live.stop": {
      if (state.managedId) {
        await voiceSessionManager.stop(state.managedId);
        state.managedId = null;
      }
      send(ws, "live.closed", { reason: "client_stop" });
      return;
    }

    case "audio.chunk": {
      if (!state.managedId) {
        // Auto-start Live when the first chunk arrives (simpler clients).
        await startLiveForConnection(ws, state, msg);
      }
      if (!state.managedId) return;

      if (typeof msg.mimeType === "string" && msg.mimeType) {
        state.mimeType = msg.mimeType;
      }
      const data = msg.data;
      if (typeof data !== "string" || !data) return;
      if (data.length > LIVE_MAX_AUDIO_CHUNK_CHARS) {
        send(ws, "error", {
          message: "Audio chunk too large.",
          code: "CHUNK_TOO_LARGE",
        });
        return;
      }
      voiceSessionManager.sendAudio(state.managedId, data, {
        mimeType: state.mimeType,
      });
      return;
    }

    case "audio.end": {
      if (state.managedId) {
        voiceSessionManager.sendAudioStreamEnd(state.managedId);
      }
      return;
    }

    case "text": {
      if (!state.managedId) {
        await startLiveForConnection(ws, state, msg);
      }
      if (!state.managedId) return;
      const text = typeof msg.text === "string" ? msg.text : "";
      if (!text.trim()) {
        send(ws, "error", {
          message: "text is required.",
          code: "MISSING_TEXT",
        });
        return;
      }
      voiceSessionManager.sendText(state.managedId, text);
      return;
    }

    case "interrupt": {
      state.turnAudioBytes = 0;
      if (state.managedId) {
        voiceSessionManager.interrupt(state.managedId);
      }
      if (state.sessionId) {
        const session = voiceService.interrupt(state.sessionId, state.user);
        send(ws, "interrupted", { session, engine: "live" });
      } else {
        send(ws, "interrupted", { session: null, engine: "live" });
      }
      return;
    }

    case "close": {
      await cleanupConnection(ws);
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

/**
 * @param {import('ws').WebSocket} ws
 * @param {LiveConnectionState} state
 * @param {object} msg
 */
async function startLiveForConnection(ws, state, msg) {
  if (state.managedId) return;

  const started = await voiceSessionManager.start({
    userId: state.user.id,
    userEmail: state.user.email,
    userName: state.user.name,
    voiceSessionId: state.sessionId,
    voice: msg.voice,
    mode: msg.mode,
    language: msg.language,
    onEvent: (event) => forwardLiveEvent(ws, state, event),
  });

  state.managedId = started.id;
  state.sessionId = started.voiceSession?.id || state.sessionId;
  if (typeof msg.mimeType === "string" && msg.mimeType) {
    state.mimeType = msg.mimeType;
  } else {
    state.mimeType = LIVE_INPUT_MIME;
  }

  send(ws, "state", {
    session: started.voiceSession,
    engine: "live",
    managedId: started.id,
    model: started.model,
  });
}

export { WS_PATH as LIVE_WS_PATH };
