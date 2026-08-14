import OpenAI from "openai";

let cachedClient = null;

export const OPENAI_IMAGE_MODEL = "gpt-image-1";

function getApiKey() {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  return key || null;
}

export function hasOpenAIKey() {
  return Boolean(getApiKey());
}

export function getOpenAIClient() {
  if (cachedClient) return cachedClient;

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Image generation is temporarily unavailable.");
  }

  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

