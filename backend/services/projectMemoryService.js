import ProjectMemory, { MEMORY_CATEGORIES } from "../models/ProjectMemory.js";
import Project from "../models/Project.js";

async function syncMemoryCount(projectId) {
  const memoryCount = await ProjectMemory.countDocuments({ project: projectId });
  await Project.findByIdAndUpdate(projectId, { $set: { "stats.memoryCount": memoryCount } });
  return memoryCount;
}

export function formatMemoriesForPrompt(memories = []) {
  if (!memories.length) return "";
  const lines = memories.map(
    (m) => `- [${m.category}] ${m.key}: ${m.value}`
  );
  return `PROJECT MEMORY (follow these unless the user overrides):\n${lines.join("\n")}`;
}

export async function listProjectMemories(projectId) {
  return ProjectMemory.find({ project: projectId }).sort({ category: 1, updatedAt: -1 }).lean();
}

export async function upsertProjectMemory(projectId, userId, { category, key, value }) {
  const normalizedKey = String(key || "").trim().slice(0, 160);
  const normalizedValue = String(value || "").trim().slice(0, 4000);
  const normalizedCategory = MEMORY_CATEGORIES.includes(category) ? category : "fact";

  if (!normalizedKey || !normalizedValue) {
    throw new Error("Memory key and value are required");
  }

  const doc = await ProjectMemory.findOneAndUpdate(
    { project: projectId, key: normalizedKey },
    {
      user: userId,
      category: normalizedCategory,
      value: normalizedValue,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await syncMemoryCount(projectId);
  return doc;
}

export async function updateProjectMemory(projectId, memoryId, patch = {}) {
  const update = {};
  if (patch.category && MEMORY_CATEGORIES.includes(patch.category)) {
    update.category = patch.category;
  }
  if (typeof patch.key === "string" && patch.key.trim()) {
    update.key = patch.key.trim().slice(0, 160);
  }
  if (typeof patch.value === "string" && patch.value.trim()) {
    update.value = patch.value.trim().slice(0, 4000);
  }
  if (!Object.keys(update).length) throw new Error("No valid fields to update");

  const doc = await ProjectMemory.findOneAndUpdate(
    { _id: memoryId, project: projectId },
    update,
    { new: true }
  );
  if (!doc) throw new Error("Memory not found");
  return doc;
}

export async function deleteProjectMemory(projectId, memoryId) {
  const result = await ProjectMemory.deleteOne({ _id: memoryId, project: projectId });
  await syncMemoryCount(projectId);
  return { deleted: result.deletedCount > 0 };
}

export async function deleteAllProjectMemories(projectId) {
  await ProjectMemory.deleteMany({ project: projectId });
  await syncMemoryCount(projectId);
}

export { MEMORY_CATEGORIES };
