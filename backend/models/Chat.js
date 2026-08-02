import mongoose from "mongoose";

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
  },
  { _id: false }
);

const ChatSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // ⚡ YAHAN TRUE SE FALSE KIYA HAI TAARI ABHI ERROR NA AAYE
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

export default mongoose.model("Chat", ChatSchema);
