import mongoose from "mongoose";

const BrowserPermissionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    origin: {
      type: String,
      required: true,
      index: true,
    },
    alwaysAllow: {
      type: Boolean,
      default: false,
    },
    alwaysDeny: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

BrowserPermissionSchema.index({ user: 1, origin: 1 }, { unique: true });

export default mongoose.model("BrowserPermission", BrowserPermissionSchema);
