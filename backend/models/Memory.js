import mongoose from "mongoose";

export const MEMORY_CATEGORIES = [
  "profile",
  "preference",
  "fact",
  "project",
  "goal",
  "task",
  "tool",
  "conversation",
];

export const MEMORY_SOURCES = ["auto", "manual", "tool", "summary"];

export const MEMORY_SCOPES = ["temporary", "long_term", "pinned"];

const MemorySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: MEMORY_CATEGORIES,
      default: "fact",
      index: true,
    },
    /** Primary durable text shown in the Memory Manager and injected into prompts. */
    content: {
      type: String,
      required: false,
      trim: true,
      maxlength: 4000,
      default: "",
    },
    /**
     * Legacy field from the previous key/value memory schema.
     * Prefer `content`; kept so existing documents still load.
     */
    value: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: undefined,
    },
    /**
     * Optional short key for duplicate detection / tool API
     * (e.g. preferred_name, coding_style). Unique per user when set.
     */
    key: {
      type: String,
      trim: true,
      maxlength: 160,
      default: null,
    },
    /** 0–1 importance score used for retrieval ranking and cleanup. */
    importance: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.5,
      index: true,
    },

    /** How long this memory should be considered. */
    scope: {
      type: String,
      enum: MEMORY_SCOPES,
      default: "long_term",
      index: true,
    },
    /** Embedding vector for semantic retrieval (text-embedding-004). */
    embedding: {
      type: [Number],
      default: undefined,
      select: false,
    },
    source: {
      type: String,
      enum: MEMORY_SOURCES,
      default: "manual",
    },

    /**
     * Source chat id for temporary memories (and best-effort traceability).
     * Kept for compatibility with existing code that uses `chatId`.
     */
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      default: null,
      index: true,
    },

    /**
     * Spec-aligned alias for `chatId`.
     * For new writes, this will be populated; for old docs it may be null.
     */
    sourceChatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      default: null,
      index: true,
    },

    /** Optional expiry for `scope=temporary`. */
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    /** 0–1 confidence score for the extractor/decision engine. */
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.5,
      index: true,
    },

    /** Optional machine tags (e.g. "name", "preferred_language"). */
    tags: {
      type: [String],
      default: [],
    },
    /** When true, `content` is AES-GCM ciphertext (see memory/encryption). */
    encrypted: {
      type: Boolean,
      default: false,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
  },
  { timestamps: true }
);

MemorySchema.index({ user: 1, updatedAt: -1 });
MemorySchema.index({ user: 1, category: 1, updatedAt: -1 });
MemorySchema.index(
  { user: 1, key: 1 },
  {
    unique: true,
    partialFilterExpression: { key: { $type: "string" } },
  }
);
MemorySchema.index({ user: 1, content: "text" });

export default mongoose.model("Memory", MemorySchema);
