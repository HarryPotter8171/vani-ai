import {
  deleteMemory,
  listMemories,
  recallMemory,
  saveMemory,
  isMemoryEnabled,
  forgetMemory,
} from "../../services/memory/index.js";

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
        enum: ["save", "recall", "list", "delete", "forget"],
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
      content: {
        type: "string",
        description: "Free-form content for forget (snippet to match)",
      },
      memoryId: {
        type: "string",
        description: "Memory id when deleting/forgetting a specific entry",
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
          const saved = await saveMemory(userId, args.key, args.value, {
            category: args.category,
            source: "tool",
            chatId: ctx.chatId || null,
          });
          return { ok: true, action, memory: saved };
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
        default:
          return { ok: false, error: `Unknown memory action: ${action}` };
      }
    } catch (err) {
      return { ok: false, error: err.message || "Memory operation failed", action };
    }
  },
};
