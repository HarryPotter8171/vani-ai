import mongoose from "mongoose";

const AttachmentSchema = new mongoose.Schema(
  {
    id: { type: String },
    fileId: { type: String },
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
    // Optional image OCR/metadata snapshot (PNG/JPG/WEBP processing).
    imageMetadata: {
      type: {
        width: { type: Number },
        height: { type: Number },
        format: { type: String },
        mimeType: { type: String },
        space: { type: String },
        channels: { type: Number },
        hasAlpha: { type: Boolean },
        orientation: { type: Number },
        density: { type: Number },
        sizeBytes: { type: Number },
      },
      default: undefined,
    },
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
    /** Per-turn orchestrator metadata (additive — old messages omit this). */
    meta: {
      type: {
        model: { type: String },
        provider: { type: String },
        inputTokens: { type: Number },
        outputTokens: { type: Number },
        costUsd: { type: Number },
        latencyMs: { type: Number },
      },
      default: undefined,
    },
    /**
     * True when the client aborted mid-stream and a partial reply was saved.
     * Enables Continue after reload; omitted/false for completed turns.
     */
    wasInterrupted: {
      type: Boolean,
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
    pinned: {
      type: Boolean,
      default: false,
      index: true,
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
    // Public read-only sharing. `shareId` is generated once and kept
    // forever (even across unshare/re-share cycles) so a single toggle can
    // gate a link on and off without ever changing it. `sparse: true` lets
    // every never-shared chat omit the field instead of colliding on `null`
    // in the unique index.
    shareId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    isShared: {
      type: Boolean,
      default: false,
    },
    sharedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

ChatSchema.index({ user: 1, project: 1, pinned: -1, updatedAt: -1 });
ChatSchema.index({ project: 1, pinned: -1, updatedAt: -1 });
ChatSchema.index({ title: "text", lastMessage: "text" });

export default mongoose.model("Chat", ChatSchema);
