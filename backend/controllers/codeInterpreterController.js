import { toPublicErrorMessage } from "../utils/errors.js";
import {
  sessionManager,
  sandboxManager,
  codeLog,
  publishPlotToCanvas,
} from "../services/codeInterpreter/init.js";

function resolveUser(req) {
  if (!req.user?._id) {
    const err = new Error("Authentication required");
    err.status = 401;
    throw err;
  }
  return {
    _id: req.user._id,
    id: req.user.id,
    email: req.user.email,
    name: req.user.name,
  };
}

function userIdOf(user) {
  return String(user._id);
}

export const codeInterpreterHealth = async (_req, res) => {
  try {
    const health = await sandboxManager.checkHealth();
    res.json({ ok: true, ...health });
  } catch (err) {
    res.status(500).json({ error: toPublicErrorMessage(err, "Health check failed") });
  }
};

export const createSession = async (req, res) => {
  try {
    const user = resolveUser(req);
    const session = await sessionManager.createSession(userIdOf(user));
    res.status(201).json({ session });
  } catch (err) {
    console.error("[code-interpreter]", err);
    res.status(err.status || 500).json({
      error: toPublicErrorMessage(err, "Unable to create session"),
    });
  }
};

export const listSessions = async (req, res) => {
  try {
    const user = resolveUser(req);
    const sessions = sessionManager.listSessions(userIdOf(user));
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: toPublicErrorMessage(err, "Unable to list sessions") });
  }
};

export const getSession = async (req, res) => {
  try {
    const user = resolveUser(req);
    const session = sessionManager.getSession(req.params.id, userIdOf(user));
    res.json({ session });
  } catch (err) {
    res.status(err.status || 500).json({
      error: toPublicErrorMessage(err, "Unable to load session"),
    });
  }
};

export const destroySession = async (req, res) => {
  try {
    const user = resolveUser(req);
    const ok = await sessionManager.destroySession(req.params.id, userIdOf(user));
    if (!ok) return res.status(404).json({ error: "Session not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: toPublicErrorMessage(err, "Unable to destroy session") });
  }
};

export const executeCode = async (req, res) => {
  try {
    const user = resolveUser(req);
    const code = req.body?.code;
    const timeoutMs = req.body?.timeoutMs;
    const stream = req.body?.stream === true || req.query?.stream === "1";

    if (stream) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      if (typeof res.flushHeaders === "function") res.flushHeaders();

      const writeEvent = (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      const result = await sessionManager.execute(
        req.params.id,
        userIdOf(user),
        {
          code,
          timeoutMs,
          onEvent: writeEvent,
        }
      );
      writeEvent({ type: "result_complete", result });
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    const result = await sessionManager.execute(
      req.params.id,
      userIdOf(user),
      { code, timeoutMs }
    );
    const session = sessionManager.getSession(req.params.id, userIdOf(user));
    res.json({ result, session });
  } catch (err) {
    console.error("[code-interpreter]", err);
    res.status(err.status || 500).json({
      error: toPublicErrorMessage(err, "Execution failed"),
    });
  }
};

export const interruptExecution = async (req, res) => {
  try {
    const user = resolveUser(req);
    const session = await sessionManager.interrupt(
      req.params.id,
      userIdOf(user)
    );
    res.json({ session });
  } catch (err) {
    res.status(err.status || 500).json({
      error: toPublicErrorMessage(err, "Unable to interrupt"),
    });
  }
};

export const restartKernel = async (req, res) => {
  try {
    const user = resolveUser(req);
    const session = await sessionManager.restart(req.params.id, userIdOf(user));
    res.json({ session });
  } catch (err) {
    res.status(err.status || 500).json({
      error: toPublicErrorMessage(err, "Unable to restart kernel"),
    });
  }
};

export const uploadSessionFile = async (req, res) => {
  try {
    const user = resolveUser(req);
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "file is required" });
    }
    const uploaded = await sessionManager.uploadFile(
      req.params.id,
      userIdOf(user),
      {
        originalName: file.originalname || file.filename || "upload",
        buffer: file.buffer
          ? file.buffer
          : await import("node:fs/promises").then((fs) =>
              fs.readFile(file.path)
            ),
        mimeType: file.mimetype,
      }
    );

    // Cleanup multer disk file if present
    if (file.path) {
      try {
        const fs = await import("node:fs/promises");
        await fs.unlink(file.path);
      } catch {
        // ignore
      }
    }

    res.status(201).json({ file: uploaded });
  } catch (err) {
    console.error("[code-interpreter]", err);
    res.status(err.status || 500).json({
      error: toPublicErrorMessage(err, "Upload failed"),
    });
  }
};

export const downloadSessionFile = async (req, res) => {
  try {
    const user = resolveUser(req);
    const payload = await sessionManager.readFile(
      req.params.id,
      userIdOf(user),
      req.params.fileId
    );
    if (!payload) return res.status(404).json({ error: "File not found" });

    res.setHeader(
      "Content-Type",
      payload.file.mimeType || "application/octet-stream"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${payload.file.name.replace(/"/g, "")}"`
    );
    res.setHeader("Cache-Control", "no-store");
    res.send(payload.buffer);
  } catch (err) {
    res.status(err.status || 500).json({
      error: toPublicErrorMessage(err, "Download failed"),
    });
  }
};

export const listSessionFiles = async (req, res) => {
  try {
    const user = resolveUser(req);
    const session = sessionManager.getSession(req.params.id, userIdOf(user));
    res.json({ files: session.files, plots: session.plots });
  } catch (err) {
    res.status(err.status || 500).json({
      error: toPublicErrorMessage(err, "Unable to list files"),
    });
  }
};

/** Publish last plot(s) from a session into Canvas. */
export const publishToCanvas = async (req, res) => {
  try {
    const user = resolveUser(req);
    const session = sessionManager.getSession(req.params.id, userIdOf(user));
    const plot = session.plots[session.plots.length - 1];
    if (!plot) {
      return res.status(400).json({ error: "No plots available to publish" });
    }

    const fileUrl = `/api/code/sessions/${session.sessionId}/files/${plot.fileId}`;
    const markdown = [
      `# ${req.body?.title || "Code Interpreter Chart"}`,
      "",
      `![chart](${fileUrl})`,
      "",
      session.lastResult?.stdout
        ? "```\n" + session.lastResult.stdout.slice(0, 4000) + "\n```"
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const published = await publishPlotToCanvas({
      userId: userIdOf(user),
      chatId: req.body?.chatId || null,
      title: req.body?.title || "Code Interpreter Chart",
      plotMarkdown: markdown,
    });

    if (!published.ok) {
      return res.status(500).json({ error: published.error || "Publish failed" });
    }
    res.json({ ok: true, canvasId: published.canvasId });
  } catch (err) {
    res.status(err.status || 500).json({
      error: toPublicErrorMessage(err, "Unable to publish to canvas"),
    });
  }
};

export const recentAudit = async (req, res) => {
  try {
    resolveUser(req);
    res.json({ events: codeLog.recent(100) });
  } catch (err) {
    res.status(401).json({ error: toPublicErrorMessage(err, "Unauthorized") });
  }
};
