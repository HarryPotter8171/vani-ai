import { toPublicErrorMessage } from "../utils/errors.js";
import {
  AI_EDIT_ACTIONS,
  CanvasConflictError,
  CanvasNotFoundError,
  CanvasValidationError,
  applyAiEdit,
  autosaveCanvas,
  closeCanvas,
  createCanvas,
  deleteCanvas,
  duplicateCanvas,
  findBySourceArtifact,
  getCanvas,
  getVersion,
  listCanvasVersions,
  listCanvases,
  reopenCanvas,
  renameCanvas,
  restoreVersion,
  setPinned,
  updateCanvas,
} from "../services/canvas/index.js";

/** Authenticated user from requireAuth — never trust client identity. */
function resolveUser(req) {
  if (!req.user?._id) {
    const err = new Error("Authentication required");
    err.status = 401;
    throw err;
  }
  return { _id: req.user._id, id: req.user.id, email: req.user.email, name: req.user.name };
}

function handleError(res, err) {
  if (err instanceof CanvasValidationError) {
    return res.status(400).json({ error: toPublicErrorMessage(err), code: err.code });
  }
  if (err instanceof CanvasNotFoundError) {
    return res.status(404).json({ error: toPublicErrorMessage(err), code: err.code });
  }
  if (err instanceof CanvasConflictError) {
    return res.status(409).json({
      error: toPublicErrorMessage(err),
      code: err.code,
      current: err.current,
    });
  }
  console.error("[canvas]", err);
  return res.status(500).json({ error: toPublicErrorMessage(err, "Canvas request failed") });
}

export const list = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const result = await listCanvases(user._id, {
      chatId: req.query.chatId || undefined,
      includeClosed: req.query.includeClosed === "true",
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
};

export const create = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const body = req.body || {};

    // Idempotent open-from-artifact: reuse an open canvas for the same artifact.
    if (body.sourceArtifactId) {
      const existing = await findBySourceArtifact(user._id, body.sourceArtifactId);
      if (existing) {
        // Refresh content if the artifact is still streaming / updated.
        if (
          body.content != null &&
          body.content !== existing.content &&
          body.syncFromArtifact
        ) {
          const updated = await updateCanvas(
            user._id,
            existing.id,
            { content: body.content, title: body.title },
            { force: true, source: "manual", note: "Synced from artifact" }
          );
          return res.json(updated);
        }
        return res.json(existing);
      }
    }

    const canvas = await createCanvas(user._id, body);
    res.status(201).json(canvas);
  } catch (err) {
    handleError(res, err);
  }
};

export const getOne = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const canvas = await getCanvas(user._id, req.params.id);
    res.json(canvas);
  } catch (err) {
    handleError(res, err);
  }
};

export const update = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const body = req.body || {};
    const canvas = await updateCanvas(
      user._id,
      req.params.id,
      {
        title: body.title,
        type: body.type,
        language: body.language,
        content: body.content,
        pinned: body.pinned,
        chatId: body.chatId,
        closedAt: body.closedAt,
      },
      {
        expectedRevision: body.expectedRevision,
        source: body.source || "manual",
        note: body.note || "",
        force: Boolean(body.force),
      }
    );
    res.json(canvas);
  } catch (err) {
    handleError(res, err);
  }
};

export const autosave = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const body = req.body || {};
    const result = await autosaveCanvas(user._id, req.params.id, {
      content: body.content,
      title: body.title,
      expectedRevision: body.expectedRevision,
    });
    if (result.conflict) {
      return res.status(409).json({
        error: "Conflict",
        code: "CONFLICT",
        saved: false,
        current: result.conflict,
      });
    }
    res.json({ saved: true, canvas: result.canvas });
  } catch (err) {
    handleError(res, err);
  }
};

export const rename = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const canvas = await renameCanvas(user._id, req.params.id, req.body?.title);
    res.json(canvas);
  } catch (err) {
    handleError(res, err);
  }
};

export const pin = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const canvas = await setPinned(user._id, req.params.id, true);
    res.json(canvas);
  } catch (err) {
    handleError(res, err);
  }
};

export const unpin = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const canvas = await setPinned(user._id, req.params.id, false);
    res.json(canvas);
  } catch (err) {
    handleError(res, err);
  }
};

export const close = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const canvas = await closeCanvas(user._id, req.params.id);
    res.json(canvas);
  } catch (err) {
    handleError(res, err);
  }
};

export const reopen = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const canvas = await reopenCanvas(user._id, req.params.id);
    res.json(canvas);
  } catch (err) {
    handleError(res, err);
  }
};

export const duplicate = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const canvas = await duplicateCanvas(user._id, req.params.id);
    res.status(201).json(canvas);
  } catch (err) {
    handleError(res, err);
  }
};

export const remove = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const result = await deleteCanvas(user._id, req.params.id);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
};

export const versions = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const result = await listCanvasVersions(user._id, req.params.id, {
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
};

export const getVersionOne = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const version = await getVersion(user._id, req.params.id, req.params.versionId);
    if (!version) {
      return res.status(404).json({ error: "Version not found", code: "NOT_FOUND" });
    }
    res.json(version);
  } catch (err) {
    handleError(res, err);
  }
};

export const restore = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const canvas = await restoreVersion(user._id, req.params.id, req.params.versionId);
    res.json(canvas);
  } catch (err) {
    handleError(res, err);
  }
};

export const aiEdit = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const canvas = await getCanvas(user._id, req.params.id);
    const body = req.body || {};
    if (body.action && !AI_EDIT_ACTIONS.includes(body.action)) {
      return res.status(400).json({
        error: `Invalid action. Expected one of: ${AI_EDIT_ACTIONS.join(", ")}`,
        code: "VALIDATION",
      });
    }
    const result = await applyAiEdit(user._id, canvas, body);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
};
