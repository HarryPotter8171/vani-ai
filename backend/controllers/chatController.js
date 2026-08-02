import Chat from "../models/Chat.js";
import User from "../models/User.js";
import { prepareMessages, streamAgentReply } from "../services/geminiService.js";
import { initTools } from "../tools/index.js";
import {
  buildProjectChatContext,
  getProjectForUser,
  syncChatCount,
  touchProject,
} from "../services/projectService.js";

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
    const { email, projectId, q } = req.query;
    if (!email) return res.json([]);
    const user = await User.findOne({ email });
    if (!user) return res.json([]);

    const filter = { user: user._id };
    if (projectId) filter.project = projectId;
    else filter.project = null; // personal chats outside projects

    if (q?.trim()) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ title: rx }, { lastMessage: rx }];
    }

    const chats = await Chat.find(filter)
      .sort({ updatedAt: -1 })
      .select("_id title lastMessage updatedAt project")
      .limit(100);
    res.json(chats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to load chats" });
  }
};

export const getChatById = async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    res.json(chat);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to load chat" });
  }
};

export const deleteChat = async (req, res) => {
  try {
    const deleted = await Chat.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Chat not found" });
    res.json({ message: "Chat deleted", id: req.params.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Delete failed" });
  }
};

export const renameChat = async (req, res) => {
  try {
    const { title } = req.body;
    const updated = await Chat.findByIdAndUpdate(req.params.id, { title }, { new: true });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Rename failed" });
  }
};

export const createOrUpdateChat = async (req, res) => {
  const { messages, message, chatId, userEmail, userName, projectId } = req.body;

  // Smart Fallback: Agar frontend se array na aakar single message aaye, toh usko handle karo
  let formattedMessages = messages;
  if (!formattedMessages || !formattedMessages.length) {
    if (message) {
      formattedMessages = [{ role: "user", content: message }];
    } else {
      return res.status(400).json({ error: "Messages required" });
    }
  }

  // Smart Fallback: Agar frontend email na bheje, toh dummy use karo error mat do
  const targetEmail = userEmail || "admin@vani.ai";

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
    // 1. User ko database mein dhoondho
    let user = await User.findOne({ email: targetEmail });
    if (!user) {
      user = await User.create({
        name: userName || "VANI User",
        email: targetEmail,
        provider: "google",
      });
    }

    // 2. Resolve optional project + RAG / memory context
    let project = null;
    let projectExtras = "";
    if (projectId) {
      project = await getProjectForUser(projectId, user._id);
      if (!project) {
        send({ error: "Project not found" });
        return;
      }
      await touchProject(project._id);
      const lastUserMsg = formattedMessages[formattedMessages.length - 1] || {};
      const built = await buildProjectChatContext(project, lastUserMsg.content || "");
      projectExtras = built.systemExtras;
      if (built.ragContext) {
        send({
          rag: {
            used: true,
            chars: built.ragContext.length,
          },
        });
      }
    }

    // 3. Parse attachments → multimodal Gemini contents + DB-safe messages
    const { contents, persistedMessages } = await prepareMessages(formattedMessages);
    initTools();

    const lastUser = formattedMessages[formattedMessages.length - 1] || {};

    // 4. Agentic stream: text before / during / after tool calls
    for await (const event of streamAgentReply({
      contents,
      userName: user.name,
      projectExtras,
      toolContext: {
        userId: user._id,
        userEmail: user.email,
        userName: user.name,
        attachments: lastUser.attachments || [],
        projectId: project?._id,
      },
      signal: abortProxy,
    })) {
      if (clientClosed) break;

      if (event.type === "delta" && event.text) {
        // 🌟 Secret Tag ko stream mein leak hone se rokte hain 🌟
        const safeText = tagFilter.push(event.text);
        if (safeText) {
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

      if (event.type === "image" && event.dataBase64) {
        // Optional rich payload — current UI ignores unknown fields (UI unchanged).
        send({
          image: {
            mimeType: event.mimeType,
            dataBase64: event.dataBase64,
            prompt: event.prompt,
          },
        });
      }
    }

    if (!clientClosed) {
      const trailing = tagFilter.flush();
      if (trailing) {
        aiReply += trailing;
        send({ delta: trailing });
      }
    }

    // Database mein User ka naam hamesha ke liye Update kar diya (agar tag mila)
    if (tagFilter.name) {
      user = await User.findByIdAndUpdate(user._id, { name: tagFilter.name }, { new: true });
    }

    // 5. Chat ko save karo — attachments metadata only (no base64)
    let chat;
    if (aiReply) {
      const updatedMessages = [...persistedMessages, { role: "assistant", content: aiReply }];

      if (chatId) {
        chat = await Chat.findByIdAndUpdate(
          chatId,
          {
            messages: updatedMessages,
            lastMessage: aiReply,
            ...(project ? { project: project._id } : {}),
          },
          { new: true }
        );
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
          lastMessage: aiReply,
        });
      }

      if (project?._id) {
        await syncChatCount(project._id);
      }
    }

    send({ done: true, chatId: chat?._id, projectId: project?._id || null });
  } catch (err) {
    console.error("Vertex Stream Error:", err);
    send({ error: err.message || "Streaming failed" });
  } finally {
    if (!res.writableEnded) res.end();
  }
};