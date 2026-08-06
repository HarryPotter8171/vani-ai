import mongoose from "mongoose";

const TransportSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["stdio", "http", "sse", "websocket"],
      required: true,
    },
    command: { type: String, trim: true },
    args: { type: [String], default: undefined },
    env: { type: Map, of: String, default: undefined },
    cwd: { type: String, trim: true },
    url: { type: String, trim: true },
    headers: { type: Map, of: String, default: undefined },
  },
  { _id: false }
);

const McpServerSchema = new mongoose.Schema(
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
      maxlength: 80,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    transport: {
      type: TransportSchema,
      required: true,
    },
    timeoutMs: {
      type: Number,
      default: 30_000,
      min: 1_000,
      max: 120_000,
    },
    autoReconnect: {
      type: Boolean,
      default: true,
    },
    maxReconnectAttempts: {
      type: Number,
      default: 5,
      min: 0,
      max: 20,
    },
  },
  { timestamps: true }
);

McpServerSchema.index({ user: 1, name: 1 });

export default mongoose.model("McpServer", McpServerSchema);
