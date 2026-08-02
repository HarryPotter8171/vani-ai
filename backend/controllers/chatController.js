import Chat from "../models/Chat.js";
import User from "../models/User.js";
import { generateReply } from "../services/geminiService.js";

export const getAllChats = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.json([]);
    const user = await User.findOne({ email });
    if (!user) return res.json([]);
    const chats = await Chat.find({ user: user._id }).sort({ updatedAt: -1 }).select("_id title");
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
  try {
    const { messages, message, chatId, userEmail, userName } = req.body;

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

    // 1. User ko database mein dhoondho
    let user = await User.findOne({ email: targetEmail });
    if (!user) {
      user = await User.create({
        name: userName || "VANI User",
        email: targetEmail,
        provider: "google",
      });
    }

    // 2. AI se reply generate karwao (Current Database Name ke sath)
    let aiReply = await generateReply(formattedMessages, user.name);

    // 🌟 3. NEW MEMORY LOGIC: AI ke reply mein Secret Tag check karo 🌟
    const nameMatch = aiReply.match(/\[UPDATE_NAME:\s*(.+?)\]/);
    if (nameMatch) {
      const newName = nameMatch[1].trim(); // Secret tag se naya naam nikaala
      
      // Database mein User ka naam hamesha ke liye Update kar diya
      user = await User.findByIdAndUpdate(user._id, { name: newName }, { new: true });
      
      // AI ke reply mein se us secret tag ko delete kar diya taaki user ko na dikhe
      aiReply = aiReply.replace(nameMatch[0], '').trim();
    }

    const updatedMessages = [...formattedMessages, { role: "assistant", content: aiReply }];

    // 4. Chat ko save karo
    let chat;
    if (chatId) {
      chat = await Chat.findByIdAndUpdate(
        chatId,
        { messages: updatedMessages, lastMessage: aiReply },
        { new: true }
      );
    } else {
      const lastUserMsg = formattedMessages[formattedMessages.length - 1]?.content || "New Chat";
      const title = lastUserMsg.substring(0, 30);
      chat = await Chat.create({
        user: user._id,
        title,
        messages: updatedMessages,
        lastMessage: aiReply,
      });
    }

    res.json({ reply: aiReply, chatId: chat._id });
  } catch (err) {
    console.error("Vertex Error:", err);
    res.status(500).json({ error: err.message });
  }
};