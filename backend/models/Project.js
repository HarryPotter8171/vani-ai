import mongoose from "mongoose";

const ProjectSettingsSchema = new mongoose.Schema(
  {
    model: { type: String, default: "gemini" },
    temperature: { type: Number, default: 0.7, min: 0, max: 2 },
    ragTopK: { type: Number, default: 6, min: 1, max: 20 },
    ragMaxChars: { type: Number, default: 8000, min: 1000, max: 24000 },
    autoSearchKnowledge: { type: Boolean, default: true },
    includeMemories: { type: Boolean, default: true },
  },
  { _id: false }
);

const ProjectSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },
    /** User-facing working instructions for the assistant inside this project */
    instructions: {
      type: String,
      default: "",
      trim: true,
      maxlength: 8000,
    },
    /** Optional override appended into the system prompt */
    systemPrompt: {
      type: String,
      default: "",
      trim: true,
      maxlength: 8000,
    },
    pinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    archived: {
      type: Boolean,
      default: false,
      index: true,
    },
    settings: {
      type: ProjectSettingsSchema,
      default: () => ({}),
    },
    stats: {
      fileCount: { type: Number, default: 0 },
      chunkCount: { type: Number, default: 0 },
      chatCount: { type: Number, default: 0 },
      memoryCount: { type: Number, default: 0 },
    },
    lastOpenedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

// Scalable list queries: millions of projects partitioned by user.
ProjectSchema.index({ user: 1, archived: 1, pinned: -1, lastOpenedAt: -1 });
ProjectSchema.index({ user: 1, archived: 1, updatedAt: -1 });
ProjectSchema.index({ user: 1, name: "text", description: "text" });

export default mongoose.model("Project", ProjectSchema);
