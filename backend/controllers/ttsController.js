import {
  streamElevenLabsMp3,
  ELEVENLABS_RATE_LIMIT_MAX,
  ELEVENLABS_RATE_LIMIT_WINDOW_MS,
} from "../services/elevenLabsTts.js";

/**
 * POST /api/tts
 * Body: { text: string }
 * Streams MP3 audio from ElevenLabs (Flash v2.5 / Jessica).
 */
export async function textToSpeech(req, res) {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({
        error: "text is required.",
        code: "MISSING_TEXT",
      });
    }

    const abort = new AbortController();
    req.on("close", () => {
      abort.abort();
    });

    await streamElevenLabsMp3(
      {
        text,
        signal: abort.signal,
      },
      res
    );
  } catch (err) {
    if (err?.name === "AbortError" || err?.code === "ABORT_ERR") {
      if (!res.headersSent) {
        return res.status(499).end();
      }
      return;
    }
    console.error("[tts]:", err?.code || err?.message || err);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const status = err.status || 500;
    // Generic client errors only — never echo provider/API-key details.
    return res.status(status).json({
      error:
        status === 400 || status === 503
          ? err.message || "Speech synthesis failed."
          : "Speech synthesis failed.",
      code: err.code || "TTS_FAILED",
    });
  }
}

export { ELEVENLABS_RATE_LIMIT_MAX, ELEVENLABS_RATE_LIMIT_WINDOW_MS };
