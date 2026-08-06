import {
  deleteMemory,
  listMemories,
  recallMemory,
  saveMemory,
  isMemoryEnabled,
  forgetMemory,
  exportMemories,
  deleteAllMemories,
  updateMemoryScope,
} from "../../services/memory/index.js";
import {
  decideMemoryWrite,
  shouldPersistDecision,
} from "../../services/memory/memoryDecisionEngine.js";

export const memoryTool = {
  id: "memory",
  name: "memory",
  displayName: "Memory",
  description:
    "Save, recall, list, or delete durable user preferences and facts across chats. Use when the user asks you to remember something, or when recalling prior preferences would improve the answer. Respect Memory OFF — if disabled, explain that memory is turned off in Settings.",
  schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["save", "recall", "list", "delete", "forget", "pin", "unpin", "clear_all", "export", "import"],
        description: "Memory operation",
      },
      key: {
        type: "string",
        description: "Short memory key, e.g. 'preferred_name', 'hometown', 'coding_style'",
      },
      value: {
        type: "string",
        description: "Value to store when action is save",
      },
      category: {
        type: "string",
        enum: [
          "profile",
          "preference",
          "fact",
          "project",
          "goal",
          "task",
          "tool",
          "conversation",
        ],
        description: "Optional category when saving",
      },
      scope: {
        type: "string",
        enum: ["long_term", "temporary", "pinned"],
        description: "Optional memory scope when action is save",
      },
      content: {
        type: "string",
        description: "Free-form content for forget (snippet to match)",
      },
      memoryId: {
        type: "string",
        description: "Memory id when deleting/forgetting a specific entry",
      },
      payload: {
        type: "string",
        description: "Export/Import payload for import/export actions",
      },
    },
    required: ["action"],
    additionalProperties: false,
  },
  async execute(args = {}, ctx = {}) {
    const action = args.action;
    const userId = ctx.userId;

    if (!userId) {
      return { ok: false, error: "Memory requires an authenticated user context." };
    }

    try {
      const enabled = await isMemoryEnabled(userId);
      if (!enabled && action !== "list") {
        return {
          ok: false,
          error: "Long-term Memory is turned off in Settings. Ask the user to enable it first.",
          action,
        };
      }

      switch (action) {
        case "save": {
          const value = args.value;
          if (!value?.trim()) {
            return { ok: false, error: "save requires value", action };
          }
          if (args.scope === "temporary") {
            const saved = await saveMemory(userId, args.key, value, {
              category: args.category,
              source: "tool",
              chatId: ctx.chatId || null,
              scope: "temporary",
              metadata: {
                decisionReason: "explicit temporary save",
                decision: "TEMPORARY",
              },
            });
            return { ok: true, action, memory: saved, persisted: true };
          }

          const decision = await decideMemoryWrite({
            content: value,
            category: args.category,
            contextText: ctx.lastUserMessage || ctx.userMessage || "",
            scope: args.scope,
            source: "tool",
          });
          if (!shouldPersistDecision(decision)) {
            return {
              ok: false,
              action,
              error:
                "This looks like a one-time or temporary detail, so it was not saved as long-term memory. Ask the user to say “remember this” only if they truly want it kept.",
              decision: decision.decision,
              reason: decision.reason,
            };
          }
          const saved = await saveMemory(userId, args.key, value, {
            category: args.category,
            source: "tool",
            chatId: ctx.chatId || null,
            scope: decision.scope || args.scope || "long_term",
            confidence: decision.confidence,
            metadata: {
              decisionReason: decision.reason || "",
              decision: decision.decision,
            },
          });
          return { ok: true, action, memory: saved, persisted: true };
        }
        case "recall": {
          const memory = await recallMemory(userId, args.key);
          return {
            ok: true,
            action,
            found: !!memory,
            memory,
          };
        }
        case "list": {
          const result = await listMemories(userId, { limit: 30 });
          return {
            ok: true,
            action,
            count: result.memories.length,
            memories: result.memories.map((m) => ({
              id: m.id,
              key: m.key,
              value: m.content,
              category: m.category,
              scope: m.scope,
              expiresAt: m.expiresAt,
              confidence: m.confidence,
              tags: m.tags,
              sourceChatId: m.sourceChatId,
              updatedAt: m.updatedAt,
            })),
          };
        }
        case "delete": {
          const target = args.memoryId || args.key;
          const result = await deleteMemory(userId, target);
          return { ok: true, action, ...result };
        }
        case "forget": {
          const result = await forgetMemory(userId, {
            memoryId: args.memoryId,
            content: args.content || args.value,
            chatId: ctx.chatId || null,
          });
          return { ok: true, action, ...result };
        }
        case "pin": {
          const target = args.memoryId || args.key;
          if (!target) return { ok: false, error: "pin requires memoryId or key", action };
          const id =
            args.memoryId ||
            (await recallMemory(userId, args.key))?.id;
          if (!id) return { ok: false, error: "Memory not found to pin", action };
          const updated = await updateMemoryScope(userId, id, "pinned");
          return { ok: true, action, memory: updated };
        }
        case "unpin": {
          const target = args.memoryId || args.key;
          if (!target) return { ok: false, error: "unpin requires memoryId or key", action };
          const id =
            args.memoryId ||
            (await recallMemory(userId, args.key))?.id;
          if (!id) return { ok: false, error: "Memory not found to unpin", action };
          const updated = await updateMemoryScope(userId, id, "long_term");
          return { ok: true, action, memory: updated };
        }
        case "clear_all": {
          const result = await deleteAllMemories(userId);
          return { ok: true, action, ...result };
        }
        case "export": {
          const payload = await exportMemories(userId);
          return { ok: true, action, payload };
        }
        case "import": {
          let parsed = null;
          try {
            parsed = args.payload ? JSON.parse(args.payload) : null;
          } catch {
            parsed = null;
          }
          if (!parsed?.memories || !Array.isArray(parsed.memories)) {
            return { ok: false, error: "import requires payload.memories[]", action };
          }
          // Best-effort: createMemory will dedupe by key/embedding.
          let created = 0;
          for (const m of parsed.memories) {
            if (!m?.content) continue;
            await saveMemory(userId, m.key, m.content, {
              category: m.category,
              source: "manual",
              importance: m.importance,
              chatId: ctx.chatId || null,
            });
            created += 1;
          }
          return { ok: true, action, created };
        }
        default:
          return { ok: false, error: `Unknown memory action: ${action}` };
      }
    } catch (err) {
      return { ok: false, error: err.message || "Memory operation failed", action };
    }
  },
};
