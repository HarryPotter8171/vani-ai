import { CHAT_MODEL, getGeminiClient } from "./geminiClient.js";
import { sanitizeIdentityResponse } from "./identity/IdentityGuard.js";

export const DEFAULT_CHAT_TITLE = "New Chat";

const MAX_TITLE_WORDS = 6;
const MAX_TITLE_CHARS = 60;
const MAX_SOURCE_CHARS = 2000;

// Last-resort title when the model call fails or returns nothing usable —
// keeps the feature production-safe (title generation should never break
// the chat flow or leave a chat untitled).
function fallbackTitle(source) {
  const words = String(source || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_TITLE_WORDS);
  if (!words.length) return DEFAULT_CHAT_TITLE;
  const title = words.join(" ");
  return title.length > MAX_TITLE_CHARS ? title.slice(0, MAX_TITLE_CHARS).trim() : title;
}

// Models occasionally wrap the answer in quotes/markdown or add a trailing
// period — strip that so the sidebar shows a clean, consistent title.
function sanitizeTitle(raw) {
  if (!raw) return "";
  let title = String(raw).trim();
  title = title.replace(/^[\s"'`*_]+|[\s"'`*_]+$/g, "").trim();
  title = title.replace(/[.。!?]+$/g, "").trim();

  const words = title.split(/\s+/).filter(Boolean);
  if (words.length > MAX_TITLE_WORDS) title = words.slice(0, MAX_TITLE_WORDS).join(" ");
  if (title.length > MAX_TITLE_CHARS) title = title.slice(0, MAX_TITLE_CHARS).trim();
  return title;
}

/**
 * Generates a short (3-6 word) chat title from the first user message using
 * the same Gemini backend as chat, but as a single non-streaming, tool-free
 * call so it stays fast and cheap. Never throws — falls back to a truncated
 * version of the source message on any model/parsing failure.
 */
export async function generateChatTitle(userMessage) {
  const source = String(userMessage || "").trim();
  if (!source) return DEFAULT_CHAT_TITLE;

  try {
    const response = await getGeminiClient().models.generateContent({
      model: CHAT_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "Generate a short, descriptive chat title (3 to 6 words) that summarizes the topic of the " +
                "message below. Respond with ONLY the title as plain text — no quotes, no markdown, no " +
                "trailing punctuation, no explanation.\n\n" +
                `Message: """${source.slice(0, MAX_SOURCE_CHARS)}"""`,
            },
          ],
        },
      ],
      config: {
        temperature: 0.3,
        maxOutputTokens: 20,
      },
    });

    const title = sanitizeTitle(sanitizeIdentityResponse(response.text || "", ""));
    return title || fallbackTitle(source);
  } catch (err) {
    console.error("Title generation failed, using fallback:", err.message || err);
    return fallbackTitle(source);
  }
}
