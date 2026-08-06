/**
 * HTTP orchestration for VANI AI Agents.
 * Keeps controllers thin — business logic lives in backend/agents/.
 */

import User from "../models/User.js";
import Chat from "../models/Chat.js";
import { agentManager, listAgentTypes, initAgentTools } from "../agents/index.js";
import { prepareMessages } from "../services/geminiService.js";
import { hydrateChatMessages } from "../services/chatAttachmentService.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { sanitizeAssistantDelta } from "../services/image/index.js";
import {
  sanitizeIdentityResponse,
} from "../services/identity/IdentityGuard.js";

export const agentRunRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: 20,
  message: "Too many agent runs. Please try again shortly.",
  keyFn: (req) =>
    req.user?.id ||
    req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
    req.ip ||
    "unknown",
});

export const listAgents = async (_req, res) => {
  try {
    initAgentTools();
    res.json({ agents: listAgentTypes() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to list agents" });
  }
};

function sessionOwnedBy(session, userId) {
  const owner = session?.context?.userId;
  if (!owner) return false;
  return String(owner) === String(userId);
}

export const getAgentSession = async (req, res) => {
  try {
    const session = agentManager.getSession(req.params.sessionId);
    if (!session || !sessionOwnedBy(session, req.user.id)) {
      return res.status(404).json({ error: "Session not found" });
    }
    res.json(session.toJSON());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to load session" });
  }
};

export const pauseAgent = async (req, res) => {
  const session = agentManager.getSession(req.params.sessionId);
  if (!session || !sessionOwnedBy(session, req.user.id)) {
    return res.status(404).json({ error: "Session not found" });
  }
  const result = agentManager.pause(req.params.sessionId);
  if (!result.ok) return res.status(404).json({ error: result.error });
  res.json(result);
};

export const resumeAgent = async (req, res) => {
  const session = agentManager.getSession(req.params.sessionId);
  if (!session || !sessionOwnedBy(session, req.user.id)) {
    return res.status(404).json({ error: "Session not found" });
  }
  const result = agentManager.resume(req.params.sessionId);
  if (!result.ok) return res.status(404).json({ error: result.error });
  res.json(result);
};

export const cancelAgent = async (req, res) => {
  const session = agentManager.getSession(req.params.sessionId);
  if (!session || !sessionOwnedBy(session, req.user.id)) {
    return res.status(404).json({ error: "Session not found" });
  }
  const result = agentManager.cancel(
    req.params.sessionId,
    req.body?.reason || "Cancelled by user"
  );
  if (!result.ok) return res.status(404).json({ error: result.error });
  res.json(result);
};

export const retryAgentStep = async (req, res) => {
  const session = agentManager.getSession(req.params.sessionId);
  if (!session || !sessionOwnedBy(session, req.user.id)) {
    return res.status(404).json({ error: "Session not found" });
  }
  const result = await agentManager.retryStep(
    req.params.sessionId,
    req.body?.stepIndex
  );
  if (!result.ok) {
    const status = result.error === "Session not found" ? 404 : 400;
    return res.status(status).json({ error: result.error });
  }
  res.json(result);
};

/**
 * POST /api/agents/run — SSE stream of agent progress + final answer.
 */
export const runAgent = async (req, res) => {
  const {
    agentType = "general",
    message,
    messages = [],
    chatId,
    projectId,
    fileIds,
    attachments,
  } = req.body || {};

  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  let clientClosed = false;
  const abortProxy = {
    get aborted() {
      return clientClosed;
    },
  };
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

  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      send({ type: "error", error: "Authentication required" });
      return;
    }

    // Conversation awareness — prefer explicit history, else load from chat.
    let conversation = Array.isArray(messages)
      ? messages.map((m) => ({
          role: m.role,
          content: m.content || "",
          attachments: m.attachments,
        }))
      : [];

    if ((!conversation.length || conversation.length === 1) && chatId) {
      try {
        const chat = await Chat.findOne({ _id: chatId, user: user._id }).select("messages");
        if (chat?.messages?.length) {
          conversation = chat.messages.map((m) => ({
            role: m.role,
            content: m.content || "",
            attachments: m.attachments,
          }));
        }
      } catch {
        /* ignore malformed chat id */
      }
    }

    // Ensure the latest user turn is present.
    const last = conversation[conversation.length - 1];
    if (!last || last.role !== "user" || last.content !== message) {
      conversation = [
        ...conversation,
        {
          role: "user",
          content: String(message),
          attachments: attachments || undefined,
        },
      ];
    }

    let hydrated = conversation;
    try {
      hydrated = await hydrateChatMessages(conversation, {
        fileIds,
        ownerId: user._id,
      });
    } catch (err) {
      console.warn("Agent hydrate skipped:", err?.message);
    }

    let contents = [];
    let persistedMessages = hydrated;
    try {
      const prepared = await prepareMessages(hydrated);
      contents = prepared.contents;
      persistedMessages = prepared.persistedMessages;
    } catch (err) {
      console.warn("Agent prepareMessages skipped:", err?.message);
    }

    const lastUser = hydrated[hydrated.length - 1] || {};
    const lastPersistedUser =
      [...persistedMessages].reverse().find((m) => m.role === "user") || null;
    const toolAttachments = (lastUser.attachments || attachments || []).map(
      (att, index) => {
        const persisted = lastPersistedUser?.attachments?.[index];
        if (!persisted?.extractedText) return att;
        return {
          ...att,
          extractedText: persisted.extractedText,
          kind: persisted.kind || att.kind,
          name: persisted.name || att.name,
          mimeType: persisted.mimeType || att.mimeType,
        };
      }
    );

    const conversationAttachments = [];
    for (const messageRow of hydrated) {
      for (const att of messageRow.attachments || []) {
        if (!att) continue;
        const mime = String(att.mimeType || "").toLowerCase();
        const kind = String(att.kind || "").toLowerCase();
        const isImage =
          kind === "image" ||
          mime.startsWith("image/") ||
          /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(att.name || "");
        if (isImage) conversationAttachments.push(att);
      }
    }

    session = agentManager.createSession({
      agentType,
      userMessage: String(message).trim(),
      conversation: hydrated,
      context: {
        userId: user._id,
        userEmail: user.email,
        userName: user.name,
        chatId: chatId || null,
        projectId: projectId || null,
        attachments: toolAttachments,
        conversationAttachments,
        contents,
        userKey: user.email,
      },
    });

    send({
      type: "session_start",
      sessionId: session.id,
      agentType: session.agentType,
      progress: 0,
    });

    let aiReply = "";

    for await (const event of agentManager.run(session, { signal: abortProxy })) {
      if (clientClosed) {
        agentManager.cancel(session.id, "Client disconnected");
        break;
      }

      if (event.type === "delta" && event.text) {
        const cleaned = sanitizeAssistantDelta(event.text);
        const identitySafe = cleaned
          ? sanitizeIdentityResponse(cleaned, "")
          : "";
        if (!identitySafe && !event.replace) continue;
        if (event.replace) {
          aiReply = identitySafe || "";
          send({
            type: "delta",
            delta: aiReply,
            replace: true,
            progress: session.progress,
          });
        } else if (identitySafe) {
          aiReply += identitySafe;
          send({ type: "delta", delta: identitySafe, progress: session.progress });
        }
        continue;
      }

      // Normalize for frontend consumers
      send({
        ...event,
        sessionId: session.id,
        progress: event.progress ?? session.progress,
      });
    }

    // Persist into chat when we have an answer (same shape as normal chat).
    let chat = null;
    aiReply = sanitizeIdentityResponse(aiReply, session.userMessage || "");
    if (aiReply && !clientClosed) {
      const updatedMessages = [
        ...persistedMessages,
        { role: "assistant", content: aiReply },
      ];

      if (chatId) {
        chat = await Chat.findOneAndUpdate(
          { _id: chatId, user: user._id },
          {
            messages: updatedMessages,
            lastMessage: aiReply,
            ...(projectId ? { project: projectId } : {}),
          },
          { new: true }
        );
        if (!chat) {
          send({ type: "error", error: "Chat not found" });
          return;
        }
      } else {
        const title = String(message).substring(0, 30) || "Agent Chat";
        chat = await Chat.create({
          user: user._id,
          project: projectId || null,
          title,
          messages: updatedMessages,
          lastMessage: aiReply,
        });
      }
    }

    send({
      type: "done",
      done: true,
      sessionId: session.id,
      chatId: chat?._id || chatId || null,
      progress: session.progress,
    });
  } catch (err) {
    console.error("Agent run error:", err);
    if (err?.code === "RATE_LIMIT" || err?.code === "SESSION_LIMIT") {
      send({ type: "error", error: err.message, code: err.code });
    } else {
      send({ type: "error", error: err?.message || "Agent run failed" });
    }
    if (session) {
      agentManager.cancel(session.id, err?.message || "Failed");
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
};
