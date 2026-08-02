import { GoogleGenAI } from "@google/genai";

// Lazy singleton shared by chat + tools. Construction is deferred until first
// use so dotenv.config() in server.js has already populated env vars.
let ai;

export function getGeminiClient() {
  if (!ai) {
    ai = new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION,
      apiVersion: "v1",
    });
  }
  return ai;
}

export const CHAT_MODEL = process.env.VANI_CHAT_MODEL || "gemini-2.5-flash";
export const IMAGE_MODEL = process.env.VANI_IMAGE_MODEL || "imagen-3.0-generate-002";
