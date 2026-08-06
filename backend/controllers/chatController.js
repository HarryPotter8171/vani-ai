import crypto from "crypto";
import Chat from "../models/Chat.js";
import User from "../models/User.js";
import { prepareMessages, streamAgentReply } from "../services/geminiService.js";
import { hydrateChatMessages } from "../services/chatAttachmentService.js";
import { storeGeneratedImage } from "../services/fileService.js";
import { DEFAULT_CHAT_TITLE, generateChatTitle } from "../services/titleService.js";
import { initTools } from "../tools/index.js";
import {
  buildProjectChatContext,
  getProjectForUser,
  syncChatCount,
  touchProject,
} from "../services/projectService.js";
import {
  autoCaptureFromChat,
  buildMemoryPromptExtras,
} from "../services/memory/index.js";
import { sanitizeAssistantDelta } from "../services/image/index.js";
import {
  sanitizeIdentityResponse,
} from "../services/identity/IdentityGuard.js";


/** Load a chat owned by the authenticated user, or null. */
async function findOwnedChat(chatId, userId, select) {
  if (!chatId || !userId) return null;
  try {
    const q = Chat.findOne({ _id: chatId, user: userId });
    if (select) q.select(select);
    return await q;
  } catch (err) {
    if (err.name === "CastError") return null;
    throw err;
  }
}


// Buffers streamed text around the secret "[UPDATE_NAME: ...]" tag so it is
// held back and never leaked to the client mid-stream, while still allowing
// every other token to flush immediately.
function createNameTagFilter() {
  const TAG_PREFIX = "[UPDATE_NAME:";
  let buffer = "";
  let capturedName = null;

  function longestSuffixThatIsTagPrefix(str) {
    const maxLen = Math.min(str.length, TAG_PREFIX.length - 1);
    for (let len = maxLen; len > 0; len--) {
      if (TAG_PREFIX.startsWith(str.slice(-len))) return len;
    }
    return 0;
  }

  return {
    push(chunk) {
      buffer += chunk;
      const openIdx = buffer.indexOf(TAG_PREFIX);

      if (openIdx === -1) {
        const holdLen = longestSuffixThatIsTagPrefix(buffer);
        const safe = holdLen > 0 ? buffer.slice(0, buffer.length - holdLen) : buffer;
        buffer = holdLen > 0 ? buffer.slice(buffer.length - holdLen) : "";
        return safe;
      }

      const safe = buffer.slice(0, openIdx);
      const rest = buffer.slice(openIdx);
      const closeIdx = rest.indexOf("]");

      if (closeIdx === -1) {
        buffer = rest;
        return safe;
      }

      const tag = rest.slice(0, closeIdx + 1);
      const match = tag.match(/\[UPDATE_NAME:\s*(.+?)\]/);
      if (match) capturedName = match[1].trim();
      buffer = rest.slice(closeIdx + 1);
      return safe;
    },
    flush() {
      const remaining = buffer;
      buffer = "";
      return remaining;
    },
    get name() {
      return capturedName;
    },
  };
}

export const getAllChats = async (req, res) => {
  try {
    const { projectId, q } = req.query;
    const userId = req.user._id;

    const filter = { user: userId };
    if (projectId) filter.project = projectId;
    else filter.project = null; // personal chats outside projects

    if (q?.trim()) {
      // Prefer Mongo $text (title + lastMessage text index) over regex scans.
      filter.$text = { $search: String(q).trim() };
    }

    const chats = await Chat.find(filter)
      // Pinned chats always float to the top; chronological order
      // (updatedAt desc) is unchanged as the tiebreak/secondary sort.
      .sort({ pinned: -1, updatedAt: -1 })
      .select("_id title lastMessage pinned updatedAt project")
      .limit(100)
      .lean();
    res.json(chats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to load chats" });
  }
};

export const getChatById = async (req, res) => {
  try {
    const chat = await findOwnedChat(req.params.id, req.user._id);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    res.json(chat);
  } catch (err) {
    // Malformed id (e.g. stale/optimistic id) is a 404, not a server error.
    if (err.name === "CastError") {
      return res.status(404).json({ error: "Chat not found" });
    }
    console.error(err);
    res.status(500).json({ error: "Unable to load chat" });
  }
};

export const deleteChat = async (req, res) => {
  try {
    const deleted = await Chat.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!deleted) return res.status(404).json({ error: "Chat not found" });
    // Keep project stats.chatCount accurate (create/update already sync).
    if (deleted.project) {
      try {
        await syncChatCount(deleted.project);
      } catch (syncErr) {
        console.warn("[chat/delete] syncChatCount failed:", syncErr?.message || syncErr);
      }
    }
    res.json({ message: "Chat deleted", id: req.params.id });
  } catch (err) {
    // Malformed id (e.g. stale/optimistic id) is a 404, not a server error.
    if (err.name === "CastError") {
      return res.status(404).json({ error: "Chat not found" });
    }
    console.error(err);
    res.status(500).json({ error: "Delete failed" });
  }
};

export const renameChat = async (req, res) => {
  try {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!title) {
      return res.status(400).json({ error: "Title is required", code: "VALIDATION" });
    }
    const updated = await Chat.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { title },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Chat not found" });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Rename failed" });
  }
};

// POST /api/chat/new — creates a fresh, empty chat (no AI call). Kept separate
// from createOrUpdateChat (streaming send) so the client can get a durable
// chatId up front, before the user has typed a first message.
export const createChat = async (req, res) => {
  try {
    const { projectId, title } = req.body;
    const user = { _id: req.user._id, email: req.user.email, name: req.user.name };

    let project = null;
    if (projectId) {
      project = await getProjectForUser(projectId, user._id);
      if (!project) return res.status(404).json({ error: "Project not found" });
      await touchProject(project._id);
    }

    const chat = await Chat.create({
      user: user._id,
      project: project?._id || null,
      title: title?.trim() || "New Chat",
    });

    if (project?._id) {
      await syncChatCount(project._id);
    }

    res.status(201).json(chat);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to create chat" });
  }
};

// PATCH /api/chat/:id/title — dedicated, validated title update.
export const updateChatTitle = async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: "Title is required" });
    }

    const updated = await Chat.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { title: String(title).trim() },
      { new: true, runValidators: true }
    ).select("_id title updatedAt");

    if (!updated) return res.status(404).json({ error: "Chat not found" });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to update title" });
  }
};

// POST /api/chat/:id/pin and /unpin — toggles a chat's pinned state. Pinned
// chats are sorted first (see getAllChats), always above unpinned ones,
// regardless of how recently they were updated.
async function setChatPinned(id, userId, pinned) {
  return Chat.findOneAndUpdate(
    { _id: id, user: userId },
    { pinned: !!pinned },
    { new: true }
  ).select("_id title pinned updatedAt");
}

export const pinChat = async (req, res) => {
  try {
    const updated = await setChatPinned(req.params.id, req.user._id, req.body.pinned !== false);
    if (!updated) return res.status(404).json({ error: "Chat not found" });
    res.json(updated);
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "Chat not found" });
    }
    console.error(err);
    res.status(500).json({ error: "Unable to pin chat" });
  }
};

export const unpinChat = async (req, res) => {
  try {
    const updated = await setChatPinned(req.params.id, req.user._id, false);
    if (!updated) return res.status(404).json({ error: "Chat not found" });
    res.json(updated);
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "Chat not found" });
    }
    console.error(err);
    res.status(500).json({ error: "Unable to unpin chat" });
  }
};

// Public sharing — a chat exposes a stable `shareId` once it's ever been
// shared, and `isShared` alone gates whether `/api/chat/shared/:shareId`
// resolves it. That split means toggling share off then back on again
// re-enables the *same* link (matching how e.g. Google Docs' "anyone with
// the link" switch behaves) instead of silently rotating it.
function generateShareId() {
  // URL-safe, unpadded base64 — 16 random bytes gives ~2^128 of keyspace,
  // comfortably collision-free without needing a retry loop.
  return crypto.randomBytes(16).toString("base64url");
}

// GET /api/chat/:id/share — current sharing status, for the share panel to
// render its initial state without needing the (much heavier) full chat doc.
export const getChatShareStatus = async (req, res) => {
  try {
    const chat = await findOwnedChat(req.params.id, req.user._id, "_id isShared shareId");
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    res.json({ isShared: !!chat.isShared, shareId: chat.isShared ? chat.shareId : null });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "Chat not found" });
    }
    console.error(err);
    res.status(500).json({ error: "Unable to load share status" });
  }
};

// POST /api/chat/:id/share — idempotent: calling it again while already
// shared just returns the existing link rather than minting a new one.
export const shareChat = async (req, res) => {
  try {
    const chat = await findOwnedChat(req.params.id, req.user._id, "_id isShared shareId sharedAt");
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    if (!chat.isShared) {
      chat.isShared = true;
      chat.sharedAt = new Date();
      if (!chat.shareId) chat.shareId = generateShareId();
      await chat.save();
    }

    res.json({ isShared: true, shareId: chat.shareId });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "Chat not found" });
    }
    // Vanishingly unlikely, but a unique-index collision on shareId would
    // surface here — worth a clear error over a raw Mongo duplicate-key one.
    if (err.code === 11000) {
      return res.status(500).json({ error: "Unable to generate a unique share link, please try again" });
    }
    console.error(err);
    res.status(500).json({ error: "Unable to share chat" });
  }
};

// POST /api/chat/:id/unshare — revokes public access. `shareId` is
// deliberately left in place (see note above) so re-sharing later restores
// the same URL instead of generating a new one.
export const unshareChat = async (req, res) => {
  try {
    const updated = await Chat.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isShared: false },
      { new: true }
    ).select("_id isShared");
    if (!updated) return res.status(404).json({ error: "Chat not found" });
    res.json({ isShared: false });
  } catch (err) {
    if (err.name === "CastError") {
      return res.status(404).json({ error: "Chat not found" });
    }
    console.error(err);
    res.status(500).json({ error: "Unable to unshare chat" });
  }
};

// GET /api/chat/shared/:shareId — PUBLIC, unauthenticated. Deliberately
// returns a narrow, read-only projection: no `user` id, no `project` id, no
// pin state — just what a public read-only viewer needs to render the
// conversation. System-role messages (tool/internal scaffolding) are
// stripped for the same reason the authenticated client already hides them.
export const getSharedChat = async (req, res) => {
  try {
    const chat = await Chat.findOne({ shareId: req.params.shareId, isShared: true }).select(
      "title messages sharedAt updatedAt"
    );
    if (!chat) return res.status(404).json({ error: "This shared conversation is unavailable." });

    res.json({
      title: chat.title,
      messages: chat.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role,
          content: m.content,
          attachments: m.attachments?.map((a) => ({
            name: a.name,
            mimeType: a.mimeType,
            kind: a.kind,
          })),
        })),
      sharedAt: chat.sharedAt,
      updatedAt: chat.updatedAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to load shared conversation" });
  }
};

// POST /api/chat/:id/generate-title — auto-titling for the first user
// message of a chat. Only *generates* the title (Gemini call); persisting it
// is left to the existing, validated PATCH /api/chat/:id/title endpoint so
// there is a single source of truth for writing a chat's title.
//
// Idempotent by design: once a chat has any non-default title, this becomes
// a cheap no-op (`generated: false`) instead of calling the model again —
// callers should treat a falsy `title` in the response as "nothing to save".
export const generateChatTitleForChat = async (req, res) => {
  try {
    const chat = await findOwnedChat(req.params.id, req.user._id, "_id title messages");
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    const existingTitle = (chat.title || "").trim();
    if (existingTitle && existingTitle !== DEFAULT_CHAT_TITLE) {
      return res.json({ title: existingTitle, generated: false });
    }

    const { message } = req.body;
    const firstUserMessage =
      (message && String(message).trim()) ||
      chat.messages.find((m) => m.role === "user")?.content ||
      "";

    const title = await generateChatTitle(firstUserMessage);
    res.json({ title, generated: true });
  } catch (err) {
    // Malformed id (e.g. stale/optimistic id) is a 404, not a server error.
    if (err.name === "CastError") {
      return res.status(404).json({ error: "Chat not found" });
    }
    console.error(err);
    res.status(500).json({ error: "Unable to generate title" });
  }
};

export const createOrUpdateChat = async (req, res) => {
  const {
    messages,
    message,
    chatId,
    projectId,
    fileIds,
    preferWebSearch,
    model: requestedModel,
    voiceMode,
    /** When true, last user turn is a hidden "continue" prompt — merge into prior assistant. */
    continueGenerating,
  } = req.body;

  // Smart Fallback: Agar frontend se array na aakar single message aaye, toh usko handle karo
  let formattedMessages = messages;
  if (!formattedMessages || !formattedMessages.length) {
    if (message) {
      formattedMessages = [{ role: "user", content: message }];
    } else {
      return res.status(400).json({ error: "Messages required" });
    }
  }

  // Server-Sent Events: streamed token-by-token, unbuffered.
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  // NOTE: `req` (incoming request stream) fires 'close' as soon as the request
  // body finishes being read — that happens almost immediately and is NOT a
  // disconnect signal. `res` (outgoing response stream) only fires 'close' when
  // the underlying connection actually terminates, which is what we want to
  // detect (e.g. the user pressing Stop aborts the fetch on the frontend).
  let clientClosed = false;
  // Plain abort flag (not AbortSignal) so the tool loop can poll without
  // depending on Node AbortController wiring across stream boundaries.
  const abortProxy = {
    get aborted() {
      return clientClosed;
    },
  };
  res.on("close", () => {
    if (!res.writableEnded) {
      clientClosed = true;
    }
  });

  const send = (payload) => {
    if (clientClosed || res.writableEnded) return;
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      clientClosed = true;
    }
  };

  const tagFilter = createNameTagFilter();
  let aiReply = "";

  try {
    // 1. Reuse req.user when auth already loaded _id + name; otherwise fetch.
    let user =
      req.user?._id != null && req.user.name != null
        ? {
            _id: req.user._id,
            email: req.user.email,
            name: req.user.name,
          }
        : await User.findById(req.user._id).select("_id name email");
    if (!user?._id) {
      send({ error: "Authentication required" });
      return;
    }

    // Content for RAG/memory is stable before hydrate (hydrate enriches attachments).
    const lastUserContent =
      (formattedMessages[formattedMessages.length - 1] || {}).content || "";

    // Parallelize independent TTFT work: chat ownership, hydrate, project+RAG, memory.
    const [existingChatResult, hydrated, projectBundle, memoryBuilt] =
      await Promise.all([
        chatId
          ? findOwnedChat(chatId, user._id, "_id model")
          : Promise.resolve(null),
        hydrateChatMessages(formattedMessages, {
          fileIds,
          ownerId: user._id,
        }),
        projectId
          ? (async () => {
              const projectDoc = await getProjectForUser(projectId, user._id);
              if (!projectDoc) return { error: "Project not found" };
              await touchProject(projectDoc._id);
              const built = await buildProjectChatContext(
                projectDoc,
                lastUserContent
              );
              return { project: projectDoc, built };
            })()
          : Promise.resolve(null),
        Promise.race([
          buildMemoryPromptExtras(user._id, lastUserContent, {
            chatId: chatId || null,
          }).catch((err) => {
            console.warn("Memory retrieve skipped:", err.message);
            return { extras: "", memories: [] };
          }),
          new Promise((resolve) =>
            setTimeout(() => resolve({ extras: "", memories: [] }), 1200)
          ),
        ]),
      ]);

    if (chatId && !existingChatResult) {
      send({ error: "Chat not found" });
      return;
    }
    const existingChat = existingChatResult;

    formattedMessages = hydrated;

    if (projectBundle?.error) {
      send({ error: projectBundle.error });
      return;
    }
    const project = projectBundle?.project || null;
    const projectExtras = projectBundle?.built?.systemExtras || "";
    if (projectBundle?.built?.ragContext) {
      send({
        rag: {
          used: true,
          chars: projectBundle.built.ragContext.length,
        },
      });
    }

    const memoryExtras = memoryBuilt?.extras || "";
    if (memoryBuilt?.memories?.length) {
      send({ memory: { used: true, count: memoryBuilt.memories.length } });
    }

    // 3. Parse attachments → multimodal Gemini contents + DB-safe messages
    //    (OCR / document parsers inject text; tools / search / memory unchanged)
    const { contents, persistedMessages } = await prepareMessages(formattedMessages);
    initTools();

    const isContinue = !!continueGenerating;
    let priorPartialContent = "";
    if (isContinue) {
      for (let i = formattedMessages.length - 1; i >= 0; i -= 1) {
        const m = formattedMessages[i];
        if (m?.role === "assistant" && typeof m.content === "string" && m.content) {
          priorPartialContent = m.content;
          break;
        }
      }
    }

    const lastUser = formattedMessages[formattedMessages.length - 1] || {};
    const lastPersistedUser =
      [...persistedMessages].reverse().find((m) => m.role === "user") || null;

    // Merge freshly extracted document text onto tool attachments so file_reader
    // / agents see real PDF content, not metadata-only chips.
    const toolAttachments = (lastUser.attachments || []).map((att, index) => {
      const persisted = lastPersistedUser?.attachments?.[index];
      if (!persisted?.extractedText) return att;
      return {
        ...att,
        extractedText: persisted.extractedText,
        kind: persisted.kind || att.kind,
        name: persisted.name || att.name,
        mimeType: persisted.mimeType || att.mimeType,
      };
    });

    // All conversation image attachments (hydrated) so edit tools can reach
    // uploads from earlier turns, not only the latest message.
    const conversationAttachments = [];
    for (const message of formattedMessages) {
      for (const att of message.attachments || []) {
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

    // Generated images for this turn (persisted as owned uploads + message attachments).
    const generatedAttachments = [];
    let turnUsage = null;
    let turnMeta = null;

    // Model selection: request → chat sticky → project default → Gemini.
    const projectModel = project?.settings?.model || null;
    const chatModel = existingChat?.model || null;
    const temperature =
      typeof project?.settings?.temperature === "number"
        ? project.settings.temperature
        : undefined;

    // 4. Agentic stream: text before / during / after tool calls
    for await (const event of streamAgentReply({
      contents,
      userName: user.name,
      projectExtras,
      memoryExtras,
      preferWebSearch: !!preferWebSearch,
      voiceMode: !!voiceMode,
      model: requestedModel || undefined,
      projectModel,
      chatModel,
      userMessage: lastUser.content || "",
      temperature,
      planId: req.plan?.planId || req.gate?.planId || null,
      toolContext: {
        userId: user._id,
        userEmail: user.email,
        userName: user.name,
        attachments: toolAttachments,
        conversationAttachments,
        projectId: project?._id,
        chatId: chatId || null,
      },
      signal: abortProxy,
    })) {
      if (clientClosed) break;

      if (event.type === "meta") {
        turnMeta = event;
        send({
          meta: {
            model: event.model,
            provider: event.provider,
            modelKey: event.modelKey,
            reason: event.reason,
            displayName: event.displayName,
            fallback: !!event.fallback,
          },
        });
        continue;
      }

      if (event.type === "usage" && event.usage) {
        turnUsage = event.usage;
        send({ usage: event.usage });
        continue;
      }

      if (event.type === "delta" && event.text) {
        // Strip OCR / image-metadata / base64 before anything reaches the client.
        const cleaned = sanitizeAssistantDelta(event.text);
        // Final-layer identity enforcement — fail-closed on every delta.
        const identitySafe = cleaned
          ? sanitizeIdentityResponse(cleaned, "")
          : "";
        if (!identitySafe && !event.replace) continue;

        // 🌟 Secret Tag ko stream mein leak hone se rokte hain 🌟
        const safeText = identitySafe ? tagFilter.push(identitySafe) : "";
        if (event.replace) {
          // Fixed image-edit caption (or error) — discard any prior status /
          // model prose so OCR never persists in the assistant message.
          tagFilter.flush();
          aiReply = safeText || identitySafe || "";
          send({ delta: aiReply, replace: true });
        } else if (safeText) {
          aiReply += safeText;
          send({ delta: safeText });
        }
        continue;
      }

      if (event.type === "tool_start") {
        send({
          tool: {
            status: "start",
            id: event.id,
            name: event.name,
            displayName: event.displayName,
          },
        });
        continue;
      }

      if (event.type === "tool_done") {
        send({
          tool: {
            status: "done",
            id: event.id,
            name: event.name,
            displayName: event.displayName,
            ok: event.ok,
            error: event.error,
          },
        });
        continue;
      }

      if (event.type === "image" && (event.dataBase64 || event.fileId)) {
        let fileId = event.fileId || null;
        let size = event.size || 0;
        let imageUrl = event.imageUrl || null;
        try {
          if (!fileId && event.dataBase64) {
            const stored = await storeGeneratedImage({
              ownerId: user._id,
              base64: event.dataBase64,
              mimeType: event.mimeType || "image/png",
              prompt: event.prompt || "generated-image",
            });
            fileId = stored.id;
            size = stored.size || 0;
          }
          if (fileId) {
            imageUrl = imageUrl || `/api/files/${fileId}/content`;
            generatedAttachments.push({
              id: fileId,
              fileId,
              name: event.prompt || "Generated image",
              mimeType: event.mimeType || "image/png",
              size,
              kind: "image",
            });
          }
        } catch (persistErr) {
          console.warn(
            "[chat] failed to persist generated image:",
            persistErr?.message || persistErr
          );
        }

        // Never stream PNG bytes or base64 into the SSE payload — fileId/url only.
        if (fileId) {
          send({
            image: {
              mimeType: event.mimeType || "image/png",
              prompt: event.prompt,
              fileId,
              size,
              imageUrl,
              success: true,
            },
          });
        } else if (event.dataBase64) {
          // Last-resort fallback when persistence failed — still avoid putting
          // raw binary strings in assistant text deltas.
          send({
            image: {
              mimeType: event.mimeType || "image/png",
              dataBase64: event.dataBase64,
              prompt: event.prompt,
              size,
            },
          });
        }
      }
    }

    if (!clientClosed) {
      const trailing = tagFilter.flush();
      if (trailing) {
        const safeTrailing = sanitizeIdentityResponse(trailing, "");
        if (safeTrailing) {
          aiReply += safeTrailing;
          send({ delta: safeTrailing });
        }
      }
    }

    // Absolute last identity pass before persist / client finalization.
    const identityFinal = sanitizeIdentityResponse(
      aiReply,
      lastUser?.content || ""
    );
    if (identityFinal !== aiReply) {
      aiReply = identityFinal;
      if (!clientClosed) {
        send({
          delta: isContinue ? `${priorPartialContent}${aiReply}` : aiReply,
          replace: true,
        });
      }
    }

    // Preferred chat name → profile only. Authenticated user.name stays session/JWT-synced.
    if (tagFilter.name) {
      user = await User.findByIdAndUpdate(
        user._id,
        { "profile.preferredName": tagFilter.name },
        { new: true }
      );
    }

    // 5. Chat ko save karo — attachments metadata only (no base64)
    let chat;
    if (aiReply || generatedAttachments.length || (isContinue && priorPartialContent)) {
      const mergedContent = isContinue
        ? `${priorPartialContent}${aiReply}`
        : aiReply || "Here is the generated image.";
      const interrupted =
        !!clientClosed && !!(mergedContent || "").trim();
      const assistantMessage = {
        role: "assistant",
        content: mergedContent || "Here is the generated image.",
        ...(interrupted ? { wasInterrupted: true } : {}),
        ...(generatedAttachments.length
          ? { attachments: generatedAttachments }
          : {}),
        ...(turnMeta || turnUsage
          ? {
              meta: {
                model: turnMeta?.modelKey || turnUsage?.modelKey,
                provider: turnMeta?.provider || turnUsage?.provider,
                inputTokens: turnUsage?.inputTokens,
                outputTokens: turnUsage?.outputTokens,
                costUsd: turnUsage?.costUsd,
                latencyMs: turnUsage?.latencyMs,
              },
            }
          : {}),
      };

      let updatedMessages;
      if (isContinue) {
        // Drop the hidden continue user prompt and replace the truncated assistant.
        const withoutContinuePrompt = persistedMessages.slice(0, -1);
        if (
          withoutContinuePrompt.length &&
          withoutContinuePrompt[withoutContinuePrompt.length - 1]?.role === "assistant"
        ) {
          withoutContinuePrompt[withoutContinuePrompt.length - 1] = assistantMessage;
          updatedMessages = withoutContinuePrompt;
        } else {
          updatedMessages = [...withoutContinuePrompt, assistantMessage];
        }
      } else {
        updatedMessages = [...persistedMessages, assistantMessage];
      }

      const assistantContent = assistantMessage.content;
      const stickyModel =
        requestedModel && requestedModel !== "auto"
          ? requestedModel
          : turnMeta?.modelKey || undefined;

      if (chatId) {
        chat = await Chat.findOneAndUpdate(
          { _id: chatId, user: user._id },
          {
            messages: updatedMessages,
            lastMessage: assistantContent,
            ...(project ? { project: project._id } : {}),
            ...(stickyModel ? { model: stickyModel } : {}),
          },
          { new: true }
        );
        if (!chat) {
          send({ error: "Chat not found" });
          return;
        }
      } else {
        const lastPersisted = persistedMessages[persistedMessages.length - 1];
        const lastUserMsg =
          lastPersisted?.content || lastPersisted?.attachments?.[0]?.name || "New Chat";
        const title = String(lastUserMsg).substring(0, 30);
        chat = await Chat.create({
          user: user._id,
          project: project?._id || null,
          title,
          messages: updatedMessages,
          lastMessage: assistantContent,
          model: stickyModel || "gemini",
        });
      }

      if (project?._id) {
        await syncChatCount(project._id);
      }

      // 6. Background auto-memory — never blocks the SSE response
      const persistedChatId = chat?._id;
      const captureMessages = [
        ...(isContinue
          ? updatedMessages.slice(0, -1)
          : persistedMessages),
        { role: "assistant", content: assistantContent },
      ];
      setImmediate(() => {
        autoCaptureFromChat({
          userId: user._id,
          chatId: persistedChatId,
          messages: captureMessages,
          userMessage: (() => {
            if (!isContinue) return lastUser.content || "";
            for (let i = formattedMessages.length - 2; i >= 0; i -= 1) {
              if (formattedMessages[i]?.role === "user") {
                return formattedMessages[i].content || "";
              }
            }
            return "";
          })(),
          assistantReply: assistantContent,
        }).catch((err) => console.warn("Auto memory capture failed:", err.message));
      });
    }

    send({ done: true, chatId: chat?._id, projectId: project?._id || null });
  } catch (err) {
    console.error("Vertex Stream Error:", err);
    send({ error: err.message || "Streaming failed" });
  } finally {
    if (!res.writableEnded) res.end();
  }
};