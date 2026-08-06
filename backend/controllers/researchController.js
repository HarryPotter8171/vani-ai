/**
 * HTTP orchestration for Deep Research.
 */

import crypto from "node:crypto";
import User from "../models/User.js";
import Chat from "../models/Chat.js";
import Research from "../models/Research.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { sanitizeIdentityResponse } from "../services/identity/IdentityGuard.js";
import {
  getResearchSession,
  runDeepResearch,
  resumeDeepResearch,
} from "../services/research/index.js";

export const researchRunRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: 8,
  message: "Too many research runs. Please try again shortly.",
  keyFn: (req) =>
    req.user?.id ||
    req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
    req.ip ||
    "unknown",
});

async function resolveUser(req) {
  const user = await User.findById(req.user._id);
  if (!user) {
    const err = new Error("Authentication required");
    err.status = 401;
    throw err;
  }
  return user;
}

function researchOwnedBy(session, userId) {
  if (!session) return false;
  return String(session.userId || "") === String(userId);
}

async function persistSession(session, userId) {
  if (!session) return;
  // Serialize writes per session so an older in-flight snapshot cannot
  // overwrite a newer status (e.g. planning beating completed).
  const write = async () => {
    try {
      const snapshot = session.toJSON();
      await Research.findOneAndUpdate(
        { sessionId: session.id },
        {
          sessionId: session.id,
          user: userId,
          chat: snapshot.chatId || null,
          project: snapshot.projectId || null,
          query: snapshot.query,
          status: snapshot.status,
          phase: snapshot.phase,
          progress: snapshot.progress,
          plan: snapshot.plan,
          sources: snapshot.sources,
          timeline: snapshot.timeline.slice(-80),
          contradictions: snapshot.contradictions,
          citations: snapshot.citations,
          followUpQuestions: snapshot.followUpQuestions,
          providers: snapshot.providers,
          report: snapshot.report,
          confidence: snapshot.confidence,
          error: snapshot.error,
          startedAt: snapshot.startedAt ? new Date(snapshot.startedAt) : null,
          finishedAt: snapshot.finishedAt ? new Date(snapshot.finishedAt) : null,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (err) {
      console.error("[research] persist failed:", err.message);
    }
  };

  session._persistChain = (session._persistChain || Promise.resolve())
    .then(write, write);
  await session._persistChain;
}

async function ensureChat(user, chatId, projectId, query) {
  if (chatId) {
    try {
      const existing = await Chat.findOne({ _id: chatId, user: user._id });
      if (existing) return existing;
    } catch {
      /* fall through */
    }
  }

  return Chat.create({
    user: user._id,
    project: projectId || null,
    title: `Research: ${String(query).slice(0, 60)}`,
    messages: [],
    lastMessage: query,
  });
}

/**
 * POST /api/research/run — SSE stream of research progress + report.
 */
export const runResearch = async (req, res) => {
  const {
    query,
    message,
    chatId,
    projectId,
    resumeSessionId,
  } = req.body || {};

  const researchQuery = String(query || message || "").trim();
  if (!researchQuery && !resumeSessionId) {
    return res.status(400).json({ error: "query is required" });
  }
  if (researchQuery.length > 2000) {
    return res.status(400).json({ error: "Query too long" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  let clientClosed = false;
  res.on("close", () => {
    if (!res.writableEnded) clientClosed = true;
  });

  const send = (payload) => {
    if (clientClosed || res.writableEnded) return;
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      clientClosed = true;
    }
  };

  let session = null;
  let user = null;
  let chat = null;

  try {
    user = await resolveUser(req);

    if (resumeSessionId) {
      const existing = getResearchSession(resumeSessionId);
      if (existing && !researchOwnedBy(existing, user._id)) {
        send({ type: "error", error: "Research session not found" });
        send({ type: "done", done: true });
        return;
      }
      if (existing && !existing.isTerminal) {
        const result = await resumeDeepResearch(resumeSessionId, {
          onEvent: (event) => {
            send(event);
            if (
              event.type === "phase" ||
              event.type === "completed" ||
              event.type === "error" ||
              event.type === "cancelled" ||
              event.type === "source"
            ) {
              void persistSession(existing, user._id);
            }
          },
        });
        if (!result.ok) {
          send({ type: "error", error: result.error });
          send({ type: "done", done: true });
          return res.end();
        }
        session = result.session;
        await persistSession(session, user._id);
        if (session.report && session.status === "completed" && session.chatId) {
          await appendReportToChat(session.chatId, session, user._id);
        }
        send({ type: "done", done: true, sessionId: session.id, chatId: session.chatId });
        return res.end();
      }

      // Persisted interrupted/cancelled session — restart with the saved query.
      // Prefer the stored query over client placeholders like "Resume research".
      const saved = await Research.findOne({
        sessionId: resumeSessionId,
        user: user._id,
      });
      if (saved?.query) {
        const looksLikePlaceholder =
          !researchQuery ||
          /^resume research$/i.test(researchQuery);
        if (looksLikePlaceholder) {
          req.body.query = saved.query;
        }
        send({
          type: "status",
          detail: "Restarting interrupted research from saved state",
        });
      }
    }

    // Prefer body fields after resume may have restored a saved query.
    const finalQuery = String(
      req.body?.query || req.body?.message || researchQuery || ""
    ).trim();
    if (!finalQuery) {
      send({ type: "error", error: "query is required" });
      send({ type: "done", done: true });
      return res.end();
    }

    chat = await ensureChat(user, chatId, projectId, finalQuery);

    // Persist user question immediately.
    chat.messages.push({ role: "user", content: finalQuery });
    chat.lastMessage = finalQuery;
    await chat.save();

    // Minted up front (rather than letting runDeepResearch generate one
    // internally) so onEvent below can look the live session up by id via
    // the shared registry — the `session` local isn't assigned until the
    // whole run resolves, but events fire throughout, so closing over
    // `session` directly would see `null` for every event but the last.
    const newSessionId = crypto.randomUUID();

    // If the client disconnects, pause so the run can be resumed.
    res.on("close", () => {
      const live = getResearchSession(newSessionId);
      if (live && !live.isTerminal && !live.isPaused) {
        live.pause();
        void persistSession(live, user._id);
      }
    });

    session = await runDeepResearch({
      query: finalQuery,
      userId: user._id,
      chatId: String(chat._id),
      projectId: projectId || null,
      sessionId: newSessionId,
      onEvent: (event) => {
        send({
          ...event,
          chatId: chat?._id ? String(chat._id) : event.chatId,
        });
        if (
          event.type === "phase" ||
          event.type === "plan" ||
          event.type === "source" ||
          event.type === "completed" ||
          event.type === "error" ||
          event.type === "cancelled"
        ) {
          const live = getResearchSession(newSessionId);
          if (live) void persistSession(live, user._id);
        }
      },
    });

    await persistSession(session, user._id);

    if (session.status === "completed" && session.report) {
      await appendReportToChat(chat._id, session, user._id);
      send({
        type: "done",
        done: true,
        sessionId: session.id,
        chatId: String(chat._id),
        confidence: session.confidence,
      });
    } else {
      send({
        type: "done",
        done: true,
        sessionId: session.id,
        chatId: String(chat._id),
        status: session.status,
      });
    }
  } catch (err) {
    console.error("[research] run failed:", err);
    send({ type: "error", error: err.message || "Research failed" });
    send({ type: "done", done: true });
  }

  if (!res.writableEnded) res.end();
};

async function appendReportToChat(chatId, session, userId) {
  if (!session || session._reportAppendedToChat) return;
  try {
    const chat = await Chat.findOne({ _id: chatId, user: userId });
    if (!chat) return;
    const confidencePct =
      session.confidence != null
        ? ` · Confidence ${Math.round(session.confidence * 100)}%`
        : "";
    const header = `*Deep Research report${confidencePct}*\n\n`;
    const safeReport = sanitizeIdentityResponse(
      session.report || "",
      session.query || ""
    );
    chat.messages.push({
      role: "assistant",
      content: header + safeReport,
    });
    chat.lastMessage = safeReport.slice(0, 200);
    await chat.save();
    session._reportAppendedToChat = true;
  } catch (err) {
    console.error("[research] chat append failed:", err.message);
  }
}

export const getResearch = async (req, res) => {
  try {
    const live = getResearchSession(req.params.sessionId);
    if (live) {
      if (!researchOwnedBy(live, req.user.id)) {
        return res.status(404).json({ error: "Research session not found" });
      }
      return res.json(live.toJSON());
    }

    const saved = await Research.findOne({
      sessionId: req.params.sessionId,
      user: req.user._id,
    });
    if (!saved) return res.status(404).json({ error: "Research session not found" });
    res.json({
      id: saved.sessionId,
      query: saved.query,
      chatId: saved.chat ? String(saved.chat) : null,
      projectId: saved.project ? String(saved.project) : null,
      status: saved.status,
      phase: saved.phase,
      progress: saved.progress,
      plan: saved.plan,
      sources: saved.sources,
      timeline: saved.timeline,
      contradictions: saved.contradictions,
      citations: saved.citations,
      followUpQuestions: saved.followUpQuestions,
      providers: saved.providers,
      report: saved.report,
      confidence: saved.confidence,
      error: saved.error,
      createdAt: saved.createdAt?.getTime?.() || saved.createdAt,
      updatedAt: saved.updatedAt?.getTime?.() || saved.updatedAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to load research session" });
  }
};

export const pauseResearch = async (req, res) => {
  const session = getResearchSession(req.params.sessionId);
  if (!session || !researchOwnedBy(session, req.user.id)) {
    return res.status(404).json({ error: "Session not found" });
  }
  const result = session.pause();
  if (!result.ok) return res.status(400).json(result);
  await persistSession(session, req.user._id);
  res.json({ ok: true, status: session.status });
};

export const resumeResearch = async (req, res) => {
  const session = getResearchSession(req.params.sessionId);
  if (!session || !researchOwnedBy(session, req.user.id)) {
    return res.status(404).json({ error: "Session not found" });
  }
  const result = session.resume();
  if (!result.ok) return res.status(400).json(result);
  await persistSession(session, req.user._id);
  res.json({ ok: true, status: session.status });
};

export const cancelResearch = async (req, res) => {
  const session = getResearchSession(req.params.sessionId);
  if (!session || !researchOwnedBy(session, req.user.id)) {
    return res.status(404).json({ error: "Session not found" });
  }
  session.cancel(req.body?.reason || "Cancelled by user");
  await persistSession(session, req.user._id);
  res.json({ ok: true, status: session.status });
};

export const listResearch = async (req, res) => {
  try {
    const rows = await Research.find({ user: req.user._id })
      .sort({ updatedAt: -1 })
      .select("sessionId query status progress confidence updatedAt chat")
      .limit(40);

    res.json(
      rows.map((r) => ({
        id: r.sessionId,
        query: r.query,
        status: r.status,
        progress: r.progress,
        confidence: r.confidence,
        chatId: r.chat ? String(r.chat) : null,
        updatedAt: r.updatedAt,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to list research" });
  }
};
