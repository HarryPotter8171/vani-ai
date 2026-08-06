import { voiceService } from "../services/voice/index.js";

function badRequest(res, message, code = "BAD_REQUEST") {
  return res.status(400).json({ error: message, code });
}

function notFound(res, message = "Voice session not found.") {
  return res.status(404).json({ error: message, code: "SESSION_NOT_FOUND" });
}

/**
 * POST /api/voice/session
 * Create a voice conversation session.
 */
export function createVoiceSession(req, res) {
  try {
    const { chatId, projectId, mode, voice, speed, language } = req.body || {};

    const result = voiceService.startSession({
      userId: req.user.id,
      userEmail: req.user.email,
      chatId,
      projectId,
      mode,
      voice,
      speed,
      language,
    });

    return res.status(201).json(result);
  } catch (err) {
    console.error("[voice] createSession:", err);
    return res.status(500).json({
      error: "Unable to start voice session.",
      code: "SESSION_CREATE_FAILED",
    });
  }
}

/**
 * GET /api/voice/session/:id
 */
export function getVoiceSession(req, res) {
  const session = voiceService.getOwnedSession(req.params.id, req.user);
  if (!session) return notFound(res);
  return res.json({ session });
}

/**
 * PATCH /api/voice/session/:id
 */
export function patchVoiceSession(req, res) {
  const body = req.body || {};
  const session = voiceService.updateOwnedSession(req.params.id, req.user, {
    mode: body.mode,
    state: body.state,
    voice: body.voice,
    speed: body.speed,
    language: body.language,
    muted: body.muted,
    chatId: body.chatId,
    projectId: body.projectId,
    lastError: body.lastError,
  });
  if (!session) return notFound(res);
  return res.json({ session });
}

/**
 * DELETE /api/voice/session/:id
 */
export function deleteVoiceSession(req, res) {
  const ended = voiceService.endOwnedSession(req.params.id, req.user);
  if (!ended) return notFound(res);
  return res.json(ended);
}

/**
 * GET /api/voice/voices
 */
export function listVoices(_req, res) {
  return res.json(voiceService.listVoices());
}

/**
 * POST /api/voice/stt
 * multipart field "audio" OR JSON { audioBase64, mimeType }
 */
export async function speechToText(req, res) {
  try {
    const sessionId = req.body?.sessionId || req.query?.sessionId;

    let buffer;
    let mimeType;

    if (req.file?.buffer) {
      buffer = req.file.buffer;
      mimeType = req.file.mimetype || "audio/webm";
    } else if (req.body?.audioBase64) {
      const raw = String(req.body.audioBase64).replace(
        /^data:audio\/[^;]+;base64,/,
        ""
      );
      buffer = Buffer.from(raw, "base64");
      mimeType = req.body.mimeType || "audio/webm";
      if (!buffer.length) {
        return badRequest(res, "Invalid audioBase64.", "INVALID_AUDIO");
      }
    } else {
      return badRequest(
        res,
        "Provide audio file (field: audio) or audioBase64.",
        "MISSING_AUDIO"
      );
    }

    const result = await voiceService.speechToText({
      buffer,
      mimeType,
      languageHint: req.body?.language,
      sessionId,
      user: req.user,
    });

    return res.json(result);
  } catch (err) {
    console.error("[voice] stt:", err);
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || "Transcription failed.",
      code: err.code || "STT_FAILED",
    });
  }
}

/**
 * POST /api/voice/tts
 * JSON body: { text, voice?, speed?, sessionId?, stream? }
 * When stream=true, responds with SSE audio chunks.
 */
export async function textToSpeech(req, res) {
  try {
    const { text, voice, speed, sessionId, stream } = req.body || {};

    if (!text || typeof text !== "string") {
      return badRequest(res, "text is required.", "MISSING_TEXT");
    }

    const wantStream =
      stream === true || stream === "true" || req.query.stream === "1";

    if (wantStream) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      const abort = new AbortController();
      req.on("close", () => {
        abort.abort();
      });

      for await (const event of voiceService.textToSpeechStream({
        text,
        voice,
        speed,
        sessionId,
        user: req.user,
        signal: abort.signal,
      })) {
        if (abort.signal.aborted) break;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      return res.end();
    }

    const result = await voiceService.textToSpeech({
      text,
      voice,
      speed,
      sessionId,
      user: req.user,
    });

    return res.json({
      audioBase64: result.audioBase64,
      mimeType: result.mimeType,
      format: result.format,
      sampleRate: result.sampleRate,
      channels: result.channels,
      sampleWidth: result.sampleWidth,
      voice: result.voice,
      speed: result.speed,
      model: result.model,
      charCount: result.charCount,
    });
  } catch (err) {
    console.error("[voice] tts:", err);
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || "Speech synthesis failed.",
      code: err.code || "TTS_FAILED",
    });
  }
}

/**
 * POST /api/voice/interrupt
 * Mark session interrupted (client stops playback / resumes listening).
 */
export function interruptVoice(req, res) {
  const { sessionId } = req.body || {};
  if (!sessionId) return badRequest(res, "sessionId is required.");

  const updated = voiceService.interrupt(sessionId, req.user);
  if (!updated) return notFound(res);

  return res.json({
    session: updated,
    interrupted: true,
  });
}
