import mongoose from "mongoose";

export const CANVAS_TYPES = [
  "markdown",
  "richtext",
  "code",
  "html",
  "react",
  "mermaid",
  "json",
  "csv",
  "plaintext",
];

export const CANVAS_CODE_LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "sql",
  "css",
  "xml",
  "bash",
  "other",
];

const CanvasSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      default: null,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      default: "Untitled",
    },
    type: {
      type: String,
      enum: CANVAS_TYPES,
      required: true,
      index: true,
    },
    /** Language hint for type=code (and optional for others). */
    language: {
      type: String,
      trim: true,
      maxlength: 40,
      default: null,
    },
    content: {
      type: String,
      default: "",
      maxlength: 2_000_000,
    },
    pinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    /** Monotonic revision for optimistic concurrency / conflict detection. */
    revision: {
      type: Number,
      default: 1,
      min: 1,
    },
    /** Optional link back to a client-side artifact id (message-derived). */
    sourceArtifactId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
      index: true,
    },
    /** Soft-delete; closed canvases stay recoverable until hard-deleted. */
    closedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

CanvasSchema.index({ user: 1, updatedAt: -1 });
CanvasSchema.index({ user: 1, chat: 1, closedAt: 1, pinned: -1, updatedAt: -1 });
CanvasSchema.index({ user: 1, sourceArtifactId: 1 }, { sparse: true });

export default mongoose.model("Canvas", CanvasSchema);
