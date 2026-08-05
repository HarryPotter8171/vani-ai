import {
  addKnowledgeFile,
  archiveProject,
  createProject,
  deleteProject,
  duplicateProject,
  getPinnedProjects,
  getProjectForUser,
  getRecentProjects,
  listKnowledgeFiles,
  listProjectChats,
  listProjects,
  removeKnowledgeFile,
  renameProject,
  setPinned,
  touchProject,
  updateProject,
} from "../services/projectService.js";
import {
  deleteProjectMemory,
  listProjectMemories,
  MEMORY_CATEGORIES,
  updateProjectMemory,
  upsertProjectMemory,
} from "../services/projectMemoryService.js";
import { searchKnowledgeBase } from "../services/ragService.js";

/** Authenticated user from requireAuth — never trust client identity. */
function resolveUser(req) {
  if (!req.user?._id) {
    const err = new Error("Authentication required");
    err.status = 401;
    throw err;
  }
  return { _id: req.user._id, id: req.user.id, email: req.user.email, name: req.user.name };
}

function handleError(res, err, fallback = "Request failed") {
  const status =
    err.message?.includes("not found") || err.message?.includes("Not found")
      ? 404
      : err.message?.includes("required")
        ? 400
        : 500;
  if (status >= 500) console.error(err);
  return res.status(status).json({ error: err.message || fallback });
}

export const create = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const project = await createProject(user._id, req.body);
    res.status(201).json(project);
  } catch (err) {
    handleError(res, err, "Unable to create project");
  }
};

export const list = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const archived = req.query.archived === "true";
    const pinnedOnly = req.query.pinned === "true";
    const projects = await listProjects(user._id, {
      q: req.query.q || "",
      archived,
      pinnedOnly,
      limit: Number(req.query.limit) || 50,
    });
    res.json(projects);
  } catch (err) {
    handleError(res, err, "Unable to list projects");
  }
};

export const recent = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const projects = await getRecentProjects(user._id, Number(req.query.limit) || 8);
    res.json(projects);
  } catch (err) {
    handleError(res, err, "Unable to load recent projects");
  }
};

export const pinned = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const projects = await getPinnedProjects(user._id);
    res.json(projects);
  } catch (err) {
    handleError(res, err, "Unable to load pinned projects");
  }
};

export const getOne = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const project = await getProjectForUser(req.params.id, user._id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    await touchProject(project._id);
    res.json(project);
  } catch (err) {
    handleError(res, err, "Unable to load project");
  }
};

export const update = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const project = await updateProject(req.params.id, user._id, req.body);
    res.json(project);
  } catch (err) {
    handleError(res, err, "Unable to update project");
  }
};

export const rename = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const project = await renameProject(req.params.id, user._id, req.body.name);
    res.json(project);
  } catch (err) {
    handleError(res, err, "Unable to rename project");
  }
};

export const pin = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const project = await setPinned(req.params.id, user._id, req.body.pinned !== false);
    res.json(project);
  } catch (err) {
    handleError(res, err, "Unable to pin project");
  }
};

export const unpin = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const project = await setPinned(req.params.id, user._id, false);
    res.json(project);
  } catch (err) {
    handleError(res, err, "Unable to unpin project");
  }
};

export const archive = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const project = await archiveProject(req.params.id, user._id, true);
    res.json(project);
  } catch (err) {
    handleError(res, err, "Unable to archive project");
  }
};

export const unarchive = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const project = await archiveProject(req.params.id, user._id, false);
    res.json(project);
  } catch (err) {
    handleError(res, err, "Unable to unarchive project");
  }
};

export const duplicate = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const project = await duplicateProject(req.params.id, user._id);
    res.status(201).json(project);
  } catch (err) {
    handleError(res, err, "Unable to duplicate project");
  }
};

export const remove = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const result = await deleteProject(req.params.id, user._id);
    res.json(result);
  } catch (err) {
    handleError(res, err, "Unable to delete project");
  }
};

// ── Knowledge Base ──────────────────────────────────────────────

export const listFiles = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const files = await listKnowledgeFiles(req.params.id, user._id);
    res.json(files);
  } catch (err) {
    handleError(res, err, "Unable to list files");
  }
};

export const uploadFile = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const file = await addKnowledgeFile(req.params.id, user._id, req.body.file || req.body);
    res.status(201).json(file);
  } catch (err) {
    handleError(res, err, "Unable to upload file");
  }
};

export const deleteFile = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const result = await removeKnowledgeFile(req.params.id, user._id, req.params.fileId);
    res.json(result);
  } catch (err) {
    handleError(res, err, "Unable to delete file");
  }
};

export const searchKnowledge = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const project = await getProjectForUser(req.params.id, user._id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const result = await searchKnowledgeBase(project._id, req.body.query || req.query.q || "", {
      topK: Number(req.body.topK || project.settings?.ragTopK) || 6,
      maxChars: Number(req.body.maxChars || project.settings?.ragMaxChars) || 8000,
    });
    res.json(result);
  } catch (err) {
    handleError(res, err, "Knowledge search failed");
  }
};

// ── Memory ──────────────────────────────────────────────────────

export const listMemories = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const project = await getProjectForUser(req.params.id, user._id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const memories = await listProjectMemories(project._id);
    res.json({ categories: MEMORY_CATEGORIES, memories });
  } catch (err) {
    handleError(res, err, "Unable to list memories");
  }
};

export const createMemory = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const project = await getProjectForUser(req.params.id, user._id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const memory = await upsertProjectMemory(project._id, user._id, req.body);
    res.status(201).json(memory);
  } catch (err) {
    handleError(res, err, "Unable to save memory");
  }
};

export const editMemory = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const project = await getProjectForUser(req.params.id, user._id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const memory = await updateProjectMemory(project._id, req.params.memoryId, req.body);
    res.json(memory);
  } catch (err) {
    handleError(res, err, "Unable to update memory");
  }
};

export const removeMemory = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const project = await getProjectForUser(req.params.id, user._id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const result = await deleteProjectMemory(project._id, req.params.memoryId);
    res.json(result);
  } catch (err) {
    handleError(res, err, "Unable to delete memory");
  }
};

// ── Chats ───────────────────────────────────────────────────────

export const listChats = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const chats = await listProjectChats(req.params.id, user._id, {
      q: req.query.q || "",
      limit: Number(req.query.limit) || 50,
    });
    res.json(chats);
  } catch (err) {
    handleError(res, err, "Unable to list project chats");
  }
};
