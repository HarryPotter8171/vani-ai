import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const MessageSchema = new Schema(
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
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const ChatSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
      trim: true,
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
  },
  {
    timestamps: true, // adds createdAt + updatedAt
  }
);

// Compound index: fast "list this user's chats, most recently updated first"
// queries — the primary access pattern for a chat history sidebar.
ChatSchema.index({ userId: 1, updatedAt: -1 });

// Registered as "ChatV2" (distinct from the existing "Chat" model in
// models/Chat.js) to avoid a Mongoose model-name collision if both are
// imported in the same process. The `models.ChatV2` guard also avoids
// OverwriteModelError on hot-reload / repeated module evaluation (e.g.
// serverless, tests).
export default models.ChatV2 || model("ChatV2", ChatSchema);
