import Memory from "../models/Memory.js";

const MAX_MEMORIES = 50;

export async function saveMemory(userId, key, value) {
  if (!userId) throw new Error("User required for memory");
  const normalizedKey = String(key || "")
    .trim()
    .toLowerCase()
    .slice(0, 120);
  const normalizedValue = String(value || "").trim().slice(0, 4000);
  if (!normalizedKey || !normalizedValue) {
    throw new Error("Memory key and value are required");
  }

  const count = await Memory.countDocuments({ user: userId });
  const existing = await Memory.findOne({ user: userId, key: normalizedKey });
  if (!existing && count >= MAX_MEMORIES) {
    throw new Error(`Memory limit reached (${MAX_MEMORIES})`);
  }

  const doc = await Memory.findOneAndUpdate(
    { user: userId, key: normalizedKey },
    { value: normalizedValue },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return {
    key: doc.key,
    value: doc.value,
    updatedAt: doc.updatedAt,
  };
}

export async function recallMemory(userId, key) {
  if (!userId) throw new Error("User required for memory");
  const normalizedKey = String(key || "")
    .trim()
    .toLowerCase()
    .slice(0, 120);
  const doc = await Memory.findOne({ user: userId, key: normalizedKey });
  if (!doc) return null;
  return { key: doc.key, value: doc.value, updatedAt: doc.updatedAt };
}

export async function listMemories(userId, limit = 20) {
  if (!userId) throw new Error("User required for memory");
  const docs = await Memory.find({ user: userId })
    .sort({ updatedAt: -1 })
    .limit(Math.min(limit, MAX_MEMORIES))
    .select("key value updatedAt");
  return docs.map((d) => ({
    key: d.key,
    value: d.value,
    updatedAt: d.updatedAt,
  }));
}

export async function deleteMemory(userId, key) {
  if (!userId) throw new Error("User required for memory");
  const normalizedKey = String(key || "")
    .trim()
    .toLowerCase()
    .slice(0, 120);
  const result = await Memory.deleteOne({ user: userId, key: normalizedKey });
  return { deleted: result.deletedCount > 0, key: normalizedKey };
}
