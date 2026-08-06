import mongoose from "mongoose";
import Project from "../models/Project.js";
import ProjectFile from "../models/ProjectFile.js";
import ProjectMemory from "../models/ProjectMemory.js";
import KnowledgeChunk from "../models/KnowledgeChunk.js";
import Chat from "../models/Chat.js";
import { deleteProjectKnowledge, indexProjectFile } from "./ragService.js";
import { listProjectMemories, formatMemoriesForPrompt } from "./projectMemoryService.js";

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function createProject(userId, payload = {}) {
  const name = String(payload.name || "").trim();
  if (!name) throw new Error("Project name is required");

  return Project.create({
    user: userId,
    name: name.slice(0, 120),
    description: String(payload.description || "").trim().slice(0, 2000),
    instructions: String(payload.instructions || "").trim().slice(0, 8000),
    systemPrompt: String(payload.systemPrompt || "").trim().slice(0, 8000),
    settings: payload.settings || {},
    lastOpenedAt: new Date(),
  });
}

export async function listProjects(
  userId,
  { q = "", archived = false, limit = 50, pinnedOnly = false } = {}
) {
  const filter = {
    user: userId,
    archived: !!archived,
  };
  if (pinnedOnly) filter.pinned = true;

  const term = q.trim();
  if (term) {
    // Prefer text index; fall back to regex for local/dev without index warm-up.
    try {
      return await Project.find({ ...filter, $text: { $search: term } })
        .select({ score: { $meta: "textScore" } })
        .sort({ score: { $meta: "textScore" } })
        .limit(Math.min(limit, 100))
        .lean();
    } catch {
      const rx = new RegExp(escapeRegex(term), "i");
      filter.$or = [{ name: rx }, { description: rx }];
    }
  }

  return Project.find(filter)
    .sort({ pinned: -1, lastOpenedAt: -1 })
    .limit(Math.min(limit, 100))
    .lean();
}

export async function getRecentProjects(userId, limit = 8) {
  return Project.find({ user: userId, archived: false })
    .sort({ lastOpenedAt: -1 })
    .limit(Math.min(limit, 30))
    .lean();
}

export async function getPinnedProjects(userId) {
  return Project.find({ user: userId, archived: false, pinned: true })
    .sort({ lastOpenedAt: -1 })
    .lean();
}

export async function getProjectForUser(projectId, userId) {
  if (!mongoose.Types.ObjectId.isValid(projectId)) return null;
  return Project.findOne({ _id: projectId, user: userId });
}

export async function touchProject(projectId) {
  await Project.findByIdAndUpdate(projectId, { lastOpenedAt: new Date() });
}

export async function updateProject(projectId, userId, patch = {}) {
  const project = await getProjectForUser(projectId, userId);
  if (!project) throw new Error("Project not found");

  const fields = ["name", "description", "instructions", "systemPrompt", "pinned", "archived"];
  for (const key of fields) {
    if (patch[key] !== undefined) project[key] = patch[key];
  }
  if (patch.settings && typeof patch.settings === "object") {
    project.settings = { ...project.settings.toObject?.() ?? project.settings, ...patch.settings };
  }
  if (typeof project.name === "string") project.name = project.name.trim().slice(0, 120);
  if (!project.name) throw new Error("Project name is required");

  await project.save();
  return project;
}

export async function renameProject(projectId, userId, name) {
  return updateProject(projectId, userId, { name });
}

export async function setPinned(projectId, userId, pinned) {
  return updateProject(projectId, userId, { pinned: !!pinned });
}

export async function archiveProject(projectId, userId, archived = true) {
  return updateProject(projectId, userId, { archived: !!archived });
}

export async function duplicateProject(projectId, userId) {
  const source = await getProjectForUser(projectId, userId);
  if (!source) throw new Error("Project not found");

  const copy = await Project.create({
    user: userId,
    name: `${source.name} (Copy)`.slice(0, 120),
    description: source.description,
    instructions: source.instructions,
    systemPrompt: source.systemPrompt,
    settings: source.settings,
    pinned: false,
    archived: false,
    lastOpenedAt: new Date(),
  });

  // Duplicate memories (not files/chunks — re-upload/index for fidelity).
  const memories = await ProjectMemory.find({ project: source._id }).lean();
  if (memories.length) {
    await ProjectMemory.insertMany(
      memories.map((m) => ({
        project: copy._id,
        user: userId,
        category: m.category,
        key: m.key,
        value: m.value,
      }))
    );
    copy.stats.memoryCount = memories.length;
    await copy.save();
  }

  return copy;
}

export async function deleteProject(projectId, userId) {
  const project = await getProjectForUser(projectId, userId);
  if (!project) throw new Error("Project not found");

  await Promise.all([
    deleteProjectKnowledge(projectId),
    ProjectMemory.deleteMany({ project: projectId }),
    Chat.deleteMany({ project: projectId, user: userId }),
    Project.deleteOne({ _id: projectId }),
  ]);

  return { deleted: true, id: projectId };
}

export async function addKnowledgeFile(projectId, userId, attachment) {
  const project = await getProjectForUser(projectId, userId);
  if (!project) throw new Error("Project not found");

  if (!attachment?.name || !attachment?.dataBase64) {
    throw new Error("File name and data are required");
  }

  const fileDoc = await ProjectFile.create({
    project: projectId,
    user: userId,
    name: attachment.name,
    mimeType: attachment.mimeType || "application/octet-stream",
    kind: attachment.kind || "unknown",
    size: attachment.size || 0,
    status: "pending",
  });

  // Index asynchronously-friendly but awaited for correctness in API response.
  await indexProjectFile(fileDoc, attachment);
  await touchProject(projectId);

  return ProjectFile.findById(fileDoc._id).lean();
}

export async function listKnowledgeFiles(projectId, userId) {
  const project = await getProjectForUser(projectId, userId);
  if (!project) throw new Error("Project not found");
  return ProjectFile.find({ project: projectId }).sort({ createdAt: -1 }).lean();
}

export async function removeKnowledgeFile(projectId, userId, fileId) {
  const project = await getProjectForUser(projectId, userId);
  if (!project) throw new Error("Project not found");
  // Avoid CastError -> 500 on malformed ids; treat as not found for callers.
  if (!mongoose.Types.ObjectId.isValid(fileId)) {
    throw new Error("File not found");
  }

  const file = await ProjectFile.findOne({ _id: fileId, project: projectId });
  if (!file) throw new Error("File not found");

  await KnowledgeChunk.deleteMany({ file: fileId });
  await ProjectFile.deleteOne({ _id: fileId });

  const [fileCount, chunkCount] = await Promise.all([
    ProjectFile.countDocuments({ project: projectId }),
    KnowledgeChunk.countDocuments({ project: projectId }),
  ]);
  await Project.findByIdAndUpdate(projectId, {
    $set: { "stats.fileCount": fileCount, "stats.chunkCount": chunkCount },
  });

  return { deleted: true, id: fileId };
}

export async function listProjectChats(projectId, userId, { q = "", limit = 50 } = {}) {
  const project = await getProjectForUser(projectId, userId);
  if (!project) throw new Error("Project not found");

  const filter = { project: projectId, user: userId };
  if (q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim()), "i");
    filter.$or = [{ title: rx }, { lastMessage: rx }];
  }

  return Chat.find(filter)
    .sort({ updatedAt: -1 })
    .limit(Math.min(limit, 100))
    .select("_id title lastMessage updatedAt createdAt")
    .lean();
}

export async function searchProjectChats(projectId, userId, q) {
  return listProjectChats(projectId, userId, { q, limit: 50 });
}

/**
 * Build project-aware system/context blocks for the chat model.
 */
export async function buildProjectChatContext(project, userMessage = "") {
  if (!project) return { systemExtras: "", ragContext: "", memoriesText: "" };

  const settings = project.settings || {};
  const parts = [];

  parts.push(`PROJECT CONTEXT:
Name: ${project.name}
${project.description ? `Description: ${project.description}` : ""}
You are working inside this project as VANI AI (created by Himanshu Gupta). Never claim to be Gemini, ChatGPT, Google AI, or OpenAI. Prefer project knowledge, instructions, and memory over generic assumptions.`);

  if (project.systemPrompt?.trim()) {
    parts.push(`PROJECT SYSTEM PROMPT:\n${project.systemPrompt.trim()}`);
  }
  if (project.instructions?.trim()) {
    parts.push(`PROJECT INSTRUCTIONS:\n${project.instructions.trim()}`);
  }

  let memoriesText = "";
  if (settings.includeMemories !== false) {
    const memories = await listProjectMemories(project._id);
    memoriesText = formatMemoriesForPrompt(memories);
    if (memoriesText) parts.push(memoriesText);
  }

  let ragContext = "";
  if (settings.autoSearchKnowledge !== false && userMessage.trim()) {
    const { searchKnowledgeBase } = await import("./ragService.js");
    const result = await searchKnowledgeBase(project._id, userMessage, {
      topK: settings.ragTopK || 6,
      maxChars: settings.ragMaxChars || 8000,
    });
    ragContext = result.contextText || "";
    if (ragContext) {
      parts.push(
        `PROJECT KNOWLEDGE (retrieved excerpts — cite file names when useful; ignore irrelevant bits):\n${ragContext}`
      );
    }
  }

  return {
    systemExtras: parts.filter(Boolean).join("\n\n"),
    ragContext,
    memoriesText,
  };
}

export async function syncChatCount(projectId) {
  const chatCount = await Chat.countDocuments({ project: projectId });
  await Project.findByIdAndUpdate(projectId, { $set: { "stats.chatCount": chatCount } });
}
