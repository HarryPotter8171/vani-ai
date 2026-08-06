import {
  browserManager,
  browserPermissions,
} from "../browser/init.js";

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

export const startRun = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const body = req.body || {};
    const result = await browserManager.startAutomation({
      userId: String(user._id),
      goal: body.goal,
      steps: body.steps,
      url: body.url,
      engine: body.engine,
      mode: body.mode,
      persistCookies: body.persistCookies,
      headless: body.headless !== false,
      approvalTimeoutMs: body.approvalTimeoutMs,
      // Never accept client-controlled autoApprove — approvals go through resolveApproval.
      autoApprove: null,
    });
    res.status(result.needsApproval ? 202 : 200).json(result);
  } catch (err) {
    console.error("[browser]", err);
    res.status(400).json({ error: err.message || "Unable to start browser run" });
  }
};

export const listRuns = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const runs = browserManager.listRuns(String(user._id));
    res.json({ runs });
  } catch (err) {
    console.error("[browser]", err);
    res.status(500).json({ error: err.message || "Unable to list browser runs" });
  }
};

export const getRun = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const snapshot = await browserManager.getLiveSnapshot(
      req.params.id,
      String(user._id)
    );
    if (!snapshot) return res.status(404).json({ error: "Browser run not found" });
    res.json({ run: snapshot });
  } catch (err) {
    console.error("[browser]", err);
    res.status(500).json({ error: err.message || "Unable to load browser run" });
  }
};

export const pauseRun = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const run = browserManager.pause(req.params.id, String(user._id));
    res.json({ run });
  } catch (err) {
    res.status(404).json({ error: err.message || "Unable to pause" });
  }
};

export const resumeRun = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const run = browserManager.resume(req.params.id, String(user._id));
    res.json({ run });
  } catch (err) {
    res.status(404).json({ error: err.message || "Unable to resume" });
  }
};

export const stopRun = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const run = await browserManager.stop(req.params.id, String(user._id));
    res.json({ run });
  } catch (err) {
    res.status(404).json({ error: err.message || "Unable to stop" });
  }
};

export const cleanupRun = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const ok = await browserManager.cleanupRun(req.params.id, String(user._id));
    if (!ok) return res.status(404).json({ error: "Browser run not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unable to cleanup" });
  }
};

export const getScreenshot = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const shot = browserManager.getScreenshot(
      req.params.id,
      req.params.screenshotId,
      String(user._id)
    );
    if (!shot) return res.status(404).json({ error: "Screenshot not found" });

    const buf = Buffer.from(shot.data, "base64");
    res.setHeader("Content-Type", shot.mimeType || "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message || "Unable to load screenshot" });
  }
};

export const listApprovals = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const approvals = browserPermissions.listPendingApprovals(String(user._id));
    res.json({ approvals });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unable to list approvals" });
  }
};

export const resolveApproval = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const choice = String(req.body?.choice || "").trim();
    if (!["allow_once", "always_allow", "deny"].includes(choice)) {
      return badRequest(res, "choice must be allow_once, always_allow, or deny");
    }
    const approval = await browserManager.resolveApproval(
      req.params.id,
      String(user._id),
      choice
    );
    res.json({ ok: true, approval, choice });
  } catch (err) {
    res.status(400).json({ error: err.message || "Unable to resolve approval" });
  }
};

export const listPermissions = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const permissions = await browserPermissions.listPermissions(String(user._id));
    res.json({ permissions });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unable to list permissions" });
  }
};

export const revokePermission = async (req, res) => {
  try {
    const user = await resolveUser(req);
    const origin = String(req.body?.origin || req.query?.origin || "").trim();
    if (!origin) return badRequest(res, "origin is required");
    await browserPermissions.revoke(String(user._id), origin);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message || "Unable to revoke permission" });
  }
};

export const browserHealth = async (_req, res) => {
  const { checkPlaywrightBrowsers } = await import("../browser/ensureBrowsers.js");
  const browsers = checkPlaywrightBrowsers();
  res.json({
    ok: true,
    enabled: process.env.VANI_ENABLE_BROWSER_AUTOMATION === "true",
    engines: ["chromium", "firefox", "webkit"],
    chromiumInstalled: browsers.ok,
    ...(browsers.ok
      ? {}
      : {
          installHint:
            "cd backend && npm run install:browsers  (or: npx playwright install chromium)",
        }),
  });
};
