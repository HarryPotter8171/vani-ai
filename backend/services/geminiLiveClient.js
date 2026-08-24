/**
 * Dedicated Gemini Live (Native Audio) client for Vertex AI.
 *
 * IMPORTANT: This is intentionally separate from `geminiClient.js`.
 * Chat / image / research / legacy STT+TTS keep using apiVersion "v1".
 * Live Native Audio requires apiVersion "v1beta1" on its own client so
 * `ai.live.connect()` hits BidiGenerateContent correctly.
 */

import { GoogleGenAI } from "@google/genai";
import { buildGoogleGenAIOptions } from "../config/gcpCredentials.js";
import { buildMockGeminiClient } from "./testDoubles/mockGeminiClient.js";

/** Live API version — do not reuse the shared v1 chat client. */
export const LIVE_API_VERSION = "v1beta1";

let liveAi;

/**
 * Lazy singleton for Gemini Live only.
 * @returns {import("@google/genai").GoogleGenAI}
 */
export function getGeminiLiveClient() {
  if (!liveAi) {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

    if (process.env.VANI_E2E_MODE === "true") {
      liveAi = buildMockGeminiClient();
    } else if (apiKey) {
      liveAi = new GoogleGenAI({ apiKey });
    } else {
      liveAi = new GoogleGenAI(
        buildGoogleGenAIOptions({ apiVersion: LIVE_API_VERSION })
      );
    }
  }
  return liveAi;
}

/**
 * Reset the Live singleton (tests only).
 * @internal
 */
export function _resetGeminiLiveClientForTests() {
  liveAi = undefined;
}
