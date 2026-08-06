/**
 * Agent MemoryManager — conversation awareness + durable memory integration.
 * Never breaks the existing memory service; wraps it for agent context.
 */

import {
  buildMemoryPromptExtras,
  recallMemory,
  isMemoryEnabled,
} from "../services/memory/index.js";

const MAX_CONVERSATION_TURNS = 16;
const MAX_TURN_CHARS = 2_000;

/**
 * Build a lean conversation summary for planning context.
 * @param {Array<{role: string, content: string}>} messages
 */
export function summarizeConversation(messages = []) {
  if (!Array.isArray(messages) || !messages.length) return "";

  const recent = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .slice(-MAX_CONVERSATION_TURNS);

  return recent
    .map((m) => {
      const role = m.role === "user" ? "User" : "Assistant";
      const text = String(m.content).slice(0, MAX_TURN_CHARS);
      return `${role}: ${text}`;
    })
    .join("\n");
}

export class MemoryManager {
  /**
   * @param {{ userId?: string|object, chatId?: string|null }} options
   */
  constructor({ userId = null, chatId = null } = {}) {
    this.userId = userId;
    this.chatId = chatId;
    /** @type {Map<string, unknown>} */
    this.workingMemory = new Map();
  }

  set(key, value) {
    this.workingMemory.set(key, value);
  }

  get(key) {
    return this.workingMemory.get(key);
  }

  /**
   * Load durable memories relevant to the current user message.
   * Best-effort with timeout so planning is never blocked.
   */
  async loadDurableContext(userMessage = "", { timeoutMs = 1200 } = {}) {
    if (!this.userId) {
      return { extras: "", memories: [] };
    }

    try {
      const enabled = await isMemoryEnabled(this.userId);
      if (!enabled) {
        return { extras: "", memories: [] };
      }

      const result = await Promise.race([
        buildMemoryPromptExtras(this.userId, userMessage, { chatId: this.chatId || null }),
        new Promise((resolve) =>
          setTimeout(() => resolve({ extras: "", memories: [] }), timeoutMs)
        ),
      ]);
      return {
        extras: result?.extras || "",
        memories: result?.memories || [],
      };
    } catch (err) {
      console.warn("[MemoryManager] durable load skipped:", err?.message);
      return { extras: "", memories: [] };
    }
  }

  /**
   * Targeted recall for a specific key during execution.
   */
  async recall(key) {
    if (!this.userId || !key) return null;
    try {
      return await recallMemory(this.userId, key);
    } catch {
      return null;
    }
  }

  /**
   * Compose planning/execution context string from conversation + durable memory.
   */
  async buildAgentContext({ userMessage, conversation = [] } = {}) {
    const conversationSummary = summarizeConversation(conversation);
    const durable = await this.loadDurableContext(userMessage);

    const parts = [];
    if (conversationSummary) {
      parts.push("CONVERSATION CONTEXT:\n" + conversationSummary);
    }
    if (durable.extras) {
      parts.push(durable.extras);
    }

    const working = [...this.workingMemory.entries()];
    if (working.length) {
      parts.push(
        "WORKING MEMORY:\n" +
          working.map(([k, v]) => `- ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join("\n")
      );
    }

    return {
      contextText: parts.join("\n\n"),
      conversationSummary,
      durableExtras: durable.extras,
      memories: durable.memories,
    };
  }
}
