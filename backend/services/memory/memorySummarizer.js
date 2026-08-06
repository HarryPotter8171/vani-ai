import { CHAT_MODEL, getGeminiClient } from "../geminiClient.js";
import Chat from "../../models/Chat.js";
import { sanitizeIdentityResponse } from "../identity/IdentityGuard.js";
import { createMemory, isMemoryEnabled } from "./memoryService.js";
import { MEMORY_CONFIG } from "./config.js";
import { normalizeCategory, scoreImportance } from "./validate.js";
import {
  decideCandidateMemories,
  shouldPersistDecision,
} from "./memoryDecisionEngine.js";

const EXTRACT_PROMPT = `You extract candidate memories from a conversation for VANI AI (created by Himanshu Gupta).
Never claim to be Gemini, ChatGPT, Google AI, or OpenAI — you are an internal memory extractor for VANI AI.

Return ONLY valid JSON (no markdown) with this shape:
{
  "memories": [
    {
      "category": "profile|preference|fact|project|goal|task|tool|conversation",
      "key": "optional_snake_case_key_or_null",
      "content": "one clear factual sentence about the user",
      "importance": 0.0
    }
  ],
  "summary": "optional 1-2 sentence conversation summary, or empty string"
}

Rules:
- Only extract stable long-term facts: identity, preferences, skills, durable projects/goals, tools.
- NEVER extract one-time events, medical incidents, accidents, childhood stories, purchases, travel anecdotes, moods, or device/weather issues unless the user explicitly said "remember this" / "save this" / "this is important" / "never forget this".
- Skip secrets (passwords, API keys, full payment card numbers, government IDs).
- If the user explicitly asked you to forget something, omit it.
- Prefer at most 8 high-quality candidates. Empty array is fine.
- importance is 0–1 (profile/preferences usually ≥ 0.8).
- content must stand alone without referring to "the user said".`;

function parseJsonPayload(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function formatTranscript(messages = [], maxChars = 6000) {
  const lines = [];
  for (const m of messages) {
    if (!m || m.role === "system") continue;
    const role = m.role === "assistant" ? "Assistant" : "User";
    const content = String(m.content || "").trim();
    if (!content) continue;
    lines.push(`${role}: ${content}`);
  }
  let text = lines.join("\n");
  if (text.length > maxChars) text = text.slice(-maxChars);
  return text;
}

/**
 * Ask the model to extract durable memories (+ optional summary) from a transcript.
 * Never throws — returns { memories: [], summary: "" } on failure.
 */
export async function extractMemoriesFromTranscript(transcript) {
  const source = String(transcript || "").trim();
  if (source.length < MEMORY_CONFIG.autoExtractMinChars) {
    return { memories: [], summary: "" };
  }

  try {
    const response = await getGeminiClient().models.generateContent({
      model: CHAT_MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: `${EXTRACT_PROMPT}\n\nConversation:\n"""${source}"""` }],
        },
      ],
      config: { temperature: 0.2, maxOutputTokens: 1024 },
    });

    const raw =
      response?.text ||
      response?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("") ||
      "";
    const parsed = parseJsonPayload(raw);
    if (!parsed || !Array.isArray(parsed.memories)) {
      return { memories: [], summary: "" };
    }

    const memories = parsed.memories
      .filter((m) => m && typeof m.content === "string" && m.content.trim())
      .slice(0, 8)
      .map((m) => ({
        category: normalizeCategory(m.category),
        key: typeof m.key === "string" && m.key.trim() ? m.key.trim().toLowerCase() : null,
        content: sanitizeIdentityResponse(
          String(m.content).trim(),
          ""
        ).slice(0, MEMORY_CONFIG.maxContentLength),
        importance:
          typeof m.importance === "number"
            ? Math.min(1, Math.max(0, m.importance))
            : scoreImportance({
                content: m.content,
                category: normalizeCategory(m.category),
                source: "auto",
              }),
      }));

    return {
      memories,
      summary:
        typeof parsed.summary === "string"
          ? sanitizeIdentityResponse(parsed.summary.trim(), "").slice(0, 800)
          : "",
    };
  } catch (err) {
    console.warn("[memorySummarizer] extract failed:", err.message);
    return { memories: [], summary: "" };
  }
}

/**
 * Background auto-memory: extract from recent turn + persist.
 * Fire-and-forget safe — never throws to callers.
 */
export async function autoCaptureFromChat({
  userId,
  chatId,
  messages = [],
  userMessage = "",
  assistantReply = "",
} = {}) {
  try {
    if (!userId) return { saved: 0 };
    const enabled = await isMemoryEnabled(userId);
    if (!enabled) return { saved: 0, skipped: "disabled" };

    // Prefer a compact recent window for speed.
    const window = messages.length
      ? messages.slice(-8)
      : [
          { role: "user", content: userMessage },
          { role: "assistant", content: assistantReply },
        ];

    const transcript = formatTranscript(window);
    const { memories, summary } = await extractMemoriesFromTranscript(transcript);

    const candidates = [...memories];
    // Optional conversation summary candidate (decision engine decides what to do).
    if (summary && messages.length >= MEMORY_CONFIG.summaryMinMessages) {
      candidates.push({
        category: "conversation",
        key: chatId ? `chat_summary_${chatId}` : null,
        content: summary,
        importance: 0.4,
      });
    }

    const decisions = await decideCandidateMemories({
      candidates,
      contextText: transcript,
    });

    let saved = 0;
    for (let i = 0; i < candidates.length; i++) {
      const m = candidates[i];
      const d = decisions[i];
      if (!m || !d) continue;
      if (!shouldPersistDecision(d)) continue;

      try {
        await createMemory(userId, {
          ...m,
          source: "auto",
          chatId: chatId || null,
          sourceChatId: chatId || null,
          scope: d.scope || "long_term",
          expiresAt: null,
          confidence: d.confidence,
          tags: d.tags || [],
          metadata: {
            decisionReason: d.reason || "",
            decision: d.decision,
          },
        });
        saved += 1;
      } catch (err) {
        console.warn("[memorySummarizer] save skipped:", err.message);
      }
    }

    return { saved };
  } catch (err) {
    console.warn("[memorySummarizer] autoCapture failed:", err.message);
    return { saved: 0, error: err.message };
  }
}

/**
 * Summarize an entire chat document into a conversation memory.
 * Explicit summarize always persists the conversation summary; extracted
 * fact candidates still pass through the decision engine (LONG_TERM only).
 */
export async function summarizeChat(userId, chatId) {
  const enabled = await isMemoryEnabled(userId);
  if (!enabled) throw new Error("Memory is disabled");

  const chat = await Chat.findOne({ _id: chatId, user: userId }).select("messages title");
  if (!chat) throw new Error("Chat not found");

  const transcript = formatTranscript(chat.messages, 10_000);
  const { memories, summary } = await extractMemoriesFromTranscript(transcript);

  const saved = [];

  // User explicitly requested summarize — always store the conversation summary.
  if (summary) {
    const summaryResult = await createMemory(userId, {
      category: "conversation",
      content: `Chat “${chat.title || "Untitled"}”: ${summary}`,
      key: `chat_summary_${chatId}`,
      importance: 0.45,
      source: "summary",
      chatId,
      sourceChatId: chatId,
      scope: "long_term",
      metadata: {
        decisionReason: "explicit chat summarize",
        decision: "LONG_TERM",
      },
    });
    saved.push(summaryResult.memory);
  }

  const decisions = await decideCandidateMemories({
    candidates: memories,
    contextText: transcript,
  });

  for (let i = 0; i < memories.length; i++) {
    const m = memories[i];
    const d = decisions[i];
    if (!m || !d || !shouldPersistDecision(d)) continue;

    const result = await createMemory(userId, {
      ...m,
      source: "auto",
      chatId,
      sourceChatId: chatId,
      scope: d.scope || "long_term",
      confidence: d.confidence,
      metadata: {
        decisionReason: d.reason || "",
        decision: d.decision,
      },
    });
    saved.push(result.memory);
  }

  const summaryMemory =
    saved.find((m) => m.key === `chat_summary_${chatId}`) || null;

  return { memories: saved, summary: summaryMemory };
}
