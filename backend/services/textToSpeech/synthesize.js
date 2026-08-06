import { getGeminiClient } from "../geminiClient.js";
import { sanitizeIdentityResponse } from "../identity/IdentityGuard.js";
import {
  TTS_CHANNELS,
  TTS_MAX_CHARS,
  TTS_MODEL_FALLBACKS,
  TTS_SAMPLE_RATE,
  TTS_SAMPLE_WIDTH,
} from "./config.js";
import { clampSpeed, resolveVoice } from "./voices.js";

/**
 * Strip markdown / code that sounds bad when spoken aloud.
 * Identity Guard runs first so TTS never speaks foreign model claims.
 * Insert light SSML-friendly pause cues as plain punctuation for natural rhythm.
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
    // Soften list markers into spoken pauses.
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract PCM base64 from a Gemini generateContent response.
 * @param {any} response
 * @returns {{ pcmBase64: string, mimeType: string } | null}
 */
function extractAudioPart(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const data = part?.inlineData?.data;
    if (data) {
      return {
        pcmBase64: data,
        mimeType: part.inlineData.mimeType || "audio/L16;rate=24000",
      };
    }
  }
  return null;
}

/**
 * Natural conversational TTS prompt — no robotic speed tags.
 * Delivery pacing is applied on the client via playbackRate.
 * @param {string} cleanText
 */
function buildSpeakPrompt(cleanText) {
  return (
    "You are VANI AI on a live voice call. Never claim to be Gemini, ChatGPT, Google AI, or OpenAI. " +
    "Speak like a warm, close friend — " +
    "natural, fluid, and emotionally present. Use contractions, soft pauses at " +
    "commas, and a brief breath at sentence ends. Vary rhythm slightly so it " +
    "never sounds flat or scripted. Never sound robotic, rushed, chirpy, or like " +
    "an announcer reading text. Do not add words. " +
    `Say exactly: ${cleanText}`
  );
}

/**
 * Synthesize speech via Gemini TTS. Tries fallback models on failure.
 * @param {{ text: string, voice?: string, speed?: number }} input
 */
export async function synthesizeSpeech({ text, voice, speed }) {
  const clean = sanitizeForSpeech(text);
  if (!clean) {
    const err = new Error("Nothing to speak.");
    err.status = 400;
    err.code = "EMPTY_TEXT";
    throw err;
  }
  if (clean.length > TTS_MAX_CHARS) {
    const err = new Error(`Text exceeds ${TTS_MAX_CHARS} character limit.`);
    err.status = 400;
    err.code = "TEXT_TOO_LONG";
    throw err;
  }

  const voiceName = resolveVoice(voice);
  const rate = clampSpeed(speed);
  const prompt = buildSpeakPrompt(clean);
  const ai = getGeminiClient();

  let lastError;
  for (const model of TTS_MODEL_FALLBACKS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const audio = extractAudioPart(response);
      if (!audio?.pcmBase64) {
        throw new Error("TTS returned no audio data.");
      }

      return {
        audioBase64: audio.pcmBase64,
        mimeType: audio.mimeType,
        format: "pcm_s16le",
        sampleRate: TTS_SAMPLE_RATE,
        channels: TTS_CHANNELS,
        sampleWidth: TTS_SAMPLE_WIDTH,
        voice: voiceName,
        speed: rate,
        model,
        charCount: clean.length,
      };
    } catch (err) {
      lastError = err;
      // Try next model for availability / region issues.
      continue;
    }
  }

  const error = new Error(
    lastError?.message || "Text-to-speech is temporarily unavailable."
  );
  error.status = 502;
  error.code = "TTS_FAILED";
  error.cause = lastError;
  throw error;
}

/**
 * Stream TTS as progressive PCM chunks for low-latency playback.
 * First slices are smaller so the client can start audio the instant synth returns.
 * Honors AbortSignal between slices for instant barge-in cancel.
 * @param {{ text: string, voice?: string, speed?: number, chunkBytes?: number, firstChunkBytes?: number, signal?: AbortSignal }} input
 * @yields {{ type: 'meta'|'audio'|'done'|'error', ... }}
 */
export async function* synthesizeSpeechStream(input) {
  // First slices are smaller (~50ms) so playback can start the instant synth returns;
  // later slices grow to ~100ms for efficient transport.
  const firstChunkBytes = Math.max(1200, Number(input.firstChunkBytes) || 2_400);
  const chunkBytes = Math.max(firstChunkBytes, Number(input.chunkBytes) || 4_800);
  const signal = input.signal;

  try {
    if (signal?.aborted) {
      yield { type: "error", message: "Interrupted", code: "INTERRUPTED" };
      return;
    }

    const result = await synthesizeSpeech(input);
    if (signal?.aborted) {
      yield { type: "error", message: "Interrupted", code: "INTERRUPTED" };
      return;
    }

    yield {
      type: "meta",
      sampleRate: result.sampleRate,
      channels: result.channels,
      sampleWidth: result.sampleWidth,
      format: result.format,
      voice: result.voice,
      speed: result.speed,
      model: result.model,
    };

    const buf = Buffer.from(result.audioBase64, "base64");
    let offset = 0;
    let sliceSize = firstChunkBytes;
    while (offset < buf.length) {
      if (signal?.aborted) break;
      const end = Math.min(offset + sliceSize, buf.length);
      const slice = buf.subarray(offset, end);
      yield {
        type: "audio",
        data: slice.toString("base64"),
        offset,
        byteLength: slice.length,
      };
      offset = end;
      // Grow toward steady-state chunk size after the first few slices.
      sliceSize = Math.min(chunkBytes, Math.floor(sliceSize * 1.5) || chunkBytes);
      // Yield to event loop so WS/SSE can flush early chunks without blocking.
      await Promise.resolve();
    }

    if (signal?.aborted) {
      yield { type: "error", message: "Interrupted", code: "INTERRUPTED" };
      return;
    }
    yield { type: "done", byteLength: buf.length };
  } catch (err) {
    yield {
      type: "error",
      message: err?.message || "TTS failed",
      code: err?.code || "TTS_FAILED",
    };
  }
}
