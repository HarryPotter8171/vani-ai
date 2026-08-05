import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: "",
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    avatar: {
      type: String,
      default: "",
    },

    provider: {
      type: String,
      enum: ["google", "email"],
      default: "google",
    },

    /**
     * Platform role — `admin` unlocks Production Analytics admin APIs.
     * Bootstrapped from VANI_ADMIN_EMAILS on auth sync; never client-set.
     */
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      index: true,
    },

    /** Master switch for long-term memory (ChatGPT-style). */
    memoryEnabled: {
      type: Boolean,
      default: true,
    },

    /** Structured profile fields mirrored into / surfaced by Memory. */
    profile: {
      preferredName: { type: String, default: "", trim: true, maxlength: 120 },
      preferredLanguage: { type: String, default: "", trim: true, maxlength: 40 },
      timezone: { type: String, default: "", trim: true, maxlength: 80 },
      profession: { type: String, default: "", trim: true, maxlength: 160 },
      interests: { type: [String], default: [] },
    },

    preferences: {
      responseStyle: { type: String, default: "", trim: true, maxlength: 400 },
      codingStyle: { type: String, default: "", trim: true, maxlength: 400 },
      favoriteModel: { type: String, default: "", trim: true, maxlength: 80 },
      uiPreferences: { type: String, default: "", trim: true, maxlength: 400 },
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("User", UserSchema);
