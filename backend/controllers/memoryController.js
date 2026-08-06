import {
  createMemory,
  deleteAllMemories,
  deleteMemory,
  deleteMemoryById,
  exportMemories,
  forgetMemory,
  getMemoryById,
  getMemorySettings,
  listMemories,
  recallMemory,
  saveMemory,
  summarizeChat,
  updateMemory,
  updateMemorySettings,
  MEMORY_CATEGORIES,
} from "../services/memory/index.js";
import { retrieveRelevantMemories } from "../services/memory/memoryRetriever.js";

/** Authenticated user from requireAuth — never trust client identity. */
function resolveUser(req) {
  if (!req.user?._id) {
    const err = new Error("Authentication required");
    err.status = 401;
    throw err;
  }
  return { _id: req.user._id, id: req.user.id, email: req.user.email, name: req.user.name };
}

function badRequest(res, error) {
  return res.status(400).json({ error });
}

export const getSettings = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const settings = await getMemorySettings(user._id);
    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Unable to load memory settings" });
  }
};

export const patchSettings = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const settings = await updateMemorySettings(user._id, req.body || {});
    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "Unable to update memory settings" });
  }
};

export const list = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const { limit, offset, category, q, sort } = req.query;
    const result = await listMemories(user._id, {
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
      category: category || undefined,
      q: q || undefined,
      sort: sort || "updatedAt",
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Unable to list memories" });
  }
};

export const getOne = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const memory = await getMemoryById(user._id, req.params.id);
    if (!memory) return res.status(404).json({ error: "Memory not found" });
    res.json(memory);
  } catch (err) {
    if (err.name === "CastError") return res.status(404).json({ error: "Memory not found" });
    console.error(err);
    res.status(500).json({ error: "Unable to load memory" });
  }
};

export const create = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const { content, key, category, importance, source, chatId } = req.body || {};
    if (!content && !(key && req.body?.value)) {
      return badRequest(res, "content is required");
    }

    let result;
    if (key && req.body?.value && !content) {
      const saved = await saveMemory(user._id, key, req.body.value, {
        category,
        importance,
        source: source || "manual",
        chatId,
      });
      result = {
        memory: {
          id: saved.id,
          key: saved.key,
          content: saved.value,
          category: saved.category,
          updatedAt: saved.updatedAt,
        },
        deduplicated: saved.deduplicated,
      };
    } else {
      result = await createMemory(user._id, {
        content,
        key,
        category,
        importance,
        source: source || "manual",
        chatId,
      });
    }
    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    const status = err.status || (err.code === "MEMORY_DISABLED" ? 403 : 400);
    res.status(status).json({
      error: err.message || "Unable to create memory",
      ...(err.code ? { code: err.code } : {}),
    });
  }
};

export const update = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const memory = await updateMemory(user._id, req.params.id, req.body || {});
    res.json({ memory });
  } catch (err) {
    console.error(err);
    const status = err.message === "Memory not found" ? 404 : 400;
    res.status(status).json({ error: err.message || "Unable to update memory" });
  }
};

export const remove = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const result = await deleteMemoryById(user._id, req.params.id);
    if (!result.deleted) return res.status(404).json({ error: "Memory not found" });
    res.json(result);
  } catch (err) {
    if (err.name === "CastError") return res.status(404).json({ error: "Memory not found" });
    console.error(err);
    res.status(500).json({ error: "Unable to delete memory" });
  }
};

export const forget = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const { memoryId, content, chatId, key } = req.body || {};
    if (key && !memoryId && !content) {
      const result = await deleteMemory(user._id, key);
      return res.json(result);
    }
    const result = await forgetMemory(user._id, { memoryId, content, chatId });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "Unable to forget memory" });
  }
};

export const clearAll = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const result = await deleteAllMemories(user._id);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to clear memories" });
  }
};

export const exportAll = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const payload = await exportMemories(user._id);
    res.setHeader("Content-Disposition", 'attachment; filename="vani-memories.json"');
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to export memories" });
  }
};

export const retrieve = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const query = req.body?.query || req.query?.q || "";
    const memories = await retrieveRelevantMemories(user._id, query, {
      topK: req.body?.topK ? Number(req.body.topK) : undefined,
    });
    res.json({ memories, count: memories.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to retrieve memories" });
  }
};

export const summarize = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const { chatId } = req.body || {};
    if (!chatId) return badRequest(res, "chatId is required");
    const result = await summarizeChat(user._id, chatId);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || "Unable to summarize chat" });
  }
};

export const categories = async (_req, res) => {
  res.json({ categories: MEMORY_CATEGORIES });
};

export const recall = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const key = req.query.key || req.body?.key;
    if (!key) return badRequest(res, "key is required");
    const memory = await recallMemory(user._id, key);
    res.json({ found: !!memory, memory });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to recall memory" });
  }
};
