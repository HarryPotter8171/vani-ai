import mongoose from "mongoose";

export const TEAM_ROLES = ["owner", "admin", "member"];
export const MEMBER_STATUSES = ["active", "invited"];

const TeamMemberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      default: "",
      trim: true,
      maxlength: 160,
    },
    role: {
      type: String,
      enum: TEAM_ROLES,
      default: "member",
      required: true,
    },
    status: {
      type: String,
      enum: MEMBER_STATUSES,
      default: "active",
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const TeamSchema = new mongoose.Schema(
  {
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
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    members: {
      type: [TeamMemberSchema],
      default: [],
    },
    archived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

TeamSchema.index({ "members.user": 1, archived: 1, updatedAt: -1 });
TeamSchema.index({ owner: 1, archived: 1, updatedAt: -1 });

export default mongoose.models.Team || mongoose.model("Team", TeamSchema);
