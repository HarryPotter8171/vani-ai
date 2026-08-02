import {
  deleteMemory,
  listMemories,
  recallMemory,
  saveMemory,
} from "../../services/memoryService.js";

export const memoryTool = {
  id: "memory",
  name: "memory",
  displayName: "Memory",
  description:
    "Save, recall, list, or delete durable user preferences and facts across chats. Use when the user asks you to remember something, or when recalling prior preferences would improve the answer.",
  schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["save", "recall", "list", "delete"],
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
      switch (action) {
        case "save": {
          const saved = await saveMemory(userId, args.key, args.value);
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
          const memories = await listMemories(userId);
          return { ok: true, action, count: memories.length, memories };
        }
        case "delete": {
          const result = await deleteMemory(userId, args.key);
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
