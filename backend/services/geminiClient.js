import { GoogleGenAI } from "@google/genai";
import { buildGoogleGenAIOptions } from "../config/gcpCredentials.js";
import { buildMockGeminiClient } from "./testDoubles/mockGeminiClient.js";

// Lazy singleton shared by chat + tools. Construction is deferred until first
// use so dotenv.config() in server.js has already populated env vars.
let ai;

export function getGeminiClient() {
  if (!ai) {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

    // VANI_E2E_MODE swaps in a deterministic, offline double so the Playwright
    // end-to-end suite can exercise the real server without live Google Cloud
    // credentials. Never set in production — see testDoubles/mockGeminiClient.js.
    if (process.env.VANI_E2E_MODE === "true") {
      ai = buildMockGeminiClient();
    } else if (apiKey) {
      ai = new GoogleGenAI({ apiKey });
    } else {
      ai = new GoogleGenAI(buildGoogleGenAIOptions({ apiVersion: "v1" }));
    }
  }
  return ai;
}

export const CHAT_MODEL = process.env.VANI_CHAT_MODEL || "gemini-2.5-flash";
/**
 * Gemini native image model for generateImage() and editImage().
 * Edits use generateContent with source inlineData (not Imagen editImage).
 */
export const IMAGE_MODEL =
  process.env.VANI_IMAGE_MODEL || "gemini-2.5-flash-image";
/** @deprecated Prefer IMAGE_MODEL — edits use the same Gemini image model. */
export const IMAGE_EDIT_MODEL =
  process.env.VANI_IMAGE_EDIT_MODEL || IMAGE_MODEL;
