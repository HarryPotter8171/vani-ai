import { getGeminiClient } from "../geminiClient.js";
import { STT_MODEL, STT_SYSTEM_PROMPT } from "./config.js";

/**
 * Normalize Gemini text into a structured STT result.
 * @param {string} raw
 * @returns {{ transcript: string, language: string, confidence: number }}
 */
function parseTranscriptResponse(raw) {
  const text = String(raw || "").trim();
  if (!text) {
    return { transcript: "", language: "unknown", confidence: 0 };
  }

  // Prefer JSON when the model cooperates.
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const transcript = String(parsed.transcript ?? parsed.text ?? "").trim();
      const language = normalizeLanguage(parsed.language);
      const confidence = clampConfidence(parsed.confidence);
      if (transcript) return { transcript, language, confidence };
    } catch {
      // fall through to plain-text handling
    }
  }

  // Strip accidental markdown fences / labels.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^(?:transcript|transcription)\s*:\s*/i, "")
    .trim();

  return {
    transcript: cleaned,
    language: detectLanguageHint(cleaned),
    confidence: cleaned ? 0.7 : 0,
  };
}

function normalizeLanguage(value) {
  const v = String(value || "")
    .toLowerCase()
    .trim();
  if (v === "hi" || v === "hindi" || v === "hi-in") return "hi";
  if (v === "en" || v === "english" || v === "en-in" || v === "en-us") return "en";
  if (
    v === "hi-en" ||
    v === "en-hi" ||
    v === "hinglish" ||
    v === "mixed" ||
    v === "code-mixed"
  ) {
    return "hi-en";
  }
  return "unknown";
}

function clampConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.75;
  return Math.min(1, Math.max(0, n));
}

/** Lightweight heuristic when the model omits a language tag. */
function detectLanguageHint(text) {
  const hasDevanagari = /[\u0900-\u097F]/.test(text);
  const hasLatin = /[A-Za-z]/.test(text);
  if (hasDevanagari && hasLatin) return "hi-en";
  if (hasDevanagari) return "hi";
  if (hasLatin) return "en";
  return "unknown";
}

/**
 * Transcribe an audio buffer with Gemini multimodal understanding.
 * @param {{ buffer: Buffer, mimeType: string, languageHint?: string }} input
 */
export async function transcribeAudio({ buffer, mimeType, languageHint }) {
  if (!buffer?.length) {
    const err = new Error("Audio payload is empty.");
    err.status = 400;
    err.code = "EMPTY_AUDIO";
    throw err;
  }

  const base64 = buffer.toString("base64");
  const mime = (mimeType || "audio/webm").split(";")[0].trim() || "audio/webm";

  const hint =
    languageHint && languageHint !== "auto"
      ? `\nPreferred language hint: ${languageHint}.`
      : "\nAuto-detect Hindi, English, or Hinglish.";

  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: STT_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: mime, data: base64 } },
          {
            text: `${STT_SYSTEM_PROMPT}${hint}`,
          },
        ],
      },
    ],
    config: {
      temperature: 0.1,
      maxOutputTokens: 2048,
    },
  });

  const raw =
    response?.text ||
    response?.candidates?.[0]?.content?.parts
      ?.map((p) => p?.text || "")
      .join("") ||
    "";

  const result = parseTranscriptResponse(raw);
  return {
    ...result,
    model: STT_MODEL,
    mimeType: mime,
    bytes: buffer.length,
  };
}
