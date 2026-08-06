import { Readable } from "stream";
import { sanitizeIdentityResponse } from "./identity/IdentityGuard.js";

/** ElevenLabs Flash v2.5 — low-latency conversational TTS. */
export const ELEVENLABS_MODEL =
  process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5";

/** Jessica (female, premium). Lily alternative: pFZP5JQG7iQjIQuC4Bku */
export const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || "cgSgspJ2msm6clMCkdW9";

/** Prefer slightly leaner MP3 for faster first-byte on Listen. */
export const ELEVENLABS_OUTPUT_FORMAT =
  process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128";

export const ELEVENLABS_MAX_CHARS =
  Number(process.env.ELEVENLABS_TTS_MAX_CHARS) || 5_000;

export const ELEVENLABS_RATE_LIMIT_WINDOW_MS = 60_000;
export const ELEVENLABS_RATE_LIMIT_MAX = 40;

/**
 * Strip markdown / code so TTS sounds natural.
 * Identity Guard runs first so we never speak provider/model claims.
 * @param {string} text
 * @param {string} [userMessage]
 */
export function sanitizeForSpeech(text, userMessage = "") {
  const identitySafe = sanitizeIdentityResponse(text, userMessage);
  return String(identitySafe || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>]+/g, " ")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Stream MP3 audio from ElevenLabs into an Express response.
 * Pipes upstream chunks as they arrive (no full-buffer wait).
 *
 * @param {{ text: string, userMessage?: string, signal?: AbortSignal }} input
 * @param {import('express').Response} res
 */
export async function streamElevenLabsMp3(input, res) {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    const err = new Error("ElevenLabs is not configured.");
    err.status = 503;
    err.code = "TTS_NOT_CONFIGURED";
    throw err;
  }

  const clean = sanitizeForSpeech(input.text, input.userMessage);
  if (!clean) {
    const err = new Error("Nothing to speak.");
    err.status = 400;
    err.code = "EMPTY_TEXT";
    throw err;
  }
  if (clean.length > ELEVENLABS_MAX_CHARS) {
    const err = new Error(
      `Text exceeds ${ELEVENLABS_MAX_CHARS} character limit.`
    );
    err.status = 400;
    err.code = "TEXT_TOO_LONG";
    throw err;
  }

  const voiceId = ELEVENLABS_VOICE_ID;
  const modelId = ELEVENLABS_MODEL;
  const outputFormat = ELEVENLABS_OUTPUT_FORMAT;

  const url = new URL(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`
  );
  url.searchParams.set("output_format", outputFormat);
  // 4 = max latency optimization (Flash v2.5 streaming).
  url.searchParams.set("optimize_streaming_latency", "4");

  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: clean,
      model_id: modelId,
    }),
    signal: input.signal,
  });

  if (!upstream.ok) {
    // Log upstream detail server-side only — never forward provider payloads to the client.
    const detail = await upstream.text().catch(() => "");
    if (detail) {
      console.error("[tts] elevenlabs upstream error:", upstream.status, detail.slice(0, 500));
    }
    const err = new Error("Speech synthesis failed.");
    err.status = 502;
    err.code = "TTS_FAILED";
    throw err;
  }

  if (!upstream.body) {
    const err = new Error("Speech synthesis failed.");
    err.status = 502;
    err.code = "TTS_FAILED";
    throw err;
  }

  // Frontend receives only the MP3 stream — no provider/key metadata.
  res.status(200);
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-store");

  const nodeStream = Readable.fromWeb(upstream.body);
  await new Promise((resolve, reject) => {
    const onAbort = () => {
      nodeStream.destroy();
      if (!res.writableEnded) res.destroy();
      resolve();
    };
    if (input.signal) {
      if (input.signal.aborted) {
        onAbort();
        return;
      }
      input.signal.addEventListener("abort", onAbort, { once: true });
    }
    nodeStream.on("error", (err) => {
      if (input.signal?.aborted) {
        resolve();
        return;
      }
      reject(err);
    });
    res.on("close", () => {
      nodeStream.destroy();
    });
    nodeStream.pipe(res);
    res.on("finish", resolve);
    res.on("error", (err) => {
      nodeStream.destroy();
      if (input.signal?.aborted) resolve();
      else reject(err);
    });
  });
}
