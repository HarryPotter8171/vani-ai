import mongoose from "mongoose";

const McpPermissionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    serverId: {
      type: String,
      required: true,
      index: true,
    },
    trusted: {
      type: Boolean,
      default: false,
    },
    allowedTools: {
      type: [String],
      default: [],
    },
    deniedTools: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

McpPermissionSchema.index({ user: 1, serverId: 1 }, { unique: true });

export default mongoose.model("McpPermission", McpPermissionSchema);
