import mongoose from "mongoose";

const AttachmentSchema = new mongoose.Schema(
  {
    id: { type: String },
    name: { type: String, required: true, trim: true },
    mimeType: { type: String, default: "application/octet-stream" },
    size: { type: Number, default: 0 },
    kind: {
      type: String,
      enum: ["image", "pdf", "docx", "text", "markdown", "csv", "xlsx", "zip", "unknown"],
      default: "unknown",
    },
    // Cap stored extracted text — never store raw base64 payloads.
    extractedText: { type: String },
  },
  { _id: false }
);

const MessageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    attachments: {
      type: [AttachmentSchema],
      default: undefined,
    },
  },
  { _id: false }
);

const ChatSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true,
    },
    title: {
      type: String,
      default: "New Chat",
      trim: true,
    },
    messages: {
      type: [MessageSchema],
      default: [],
    },
    lastMessage: {
      type: String,
      default: "",
    },
    model: {
      type: String,
      default: "gemini",
    },
  },
  {
    timestamps: true,
  }
);

ChatSchema.index({ user: 1, project: 1, updatedAt: -1 });
ChatSchema.index({ project: 1, updatedAt: -1 });
ChatSchema.index({ title: "text", lastMessage: "text" });

export default mongoose.model("Chat", ChatSchema);
