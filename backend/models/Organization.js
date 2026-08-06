import mongoose from "mongoose";

/** Same role vocabulary as Teams — keep org/team permission language aligned. */
export const ORG_ROLES = ["owner", "admin", "member"];
export const ORG_MEMBER_STATUSES = ["active", "invited"];

const OrgMemberSchema = new mongoose.Schema(
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
      enum: ORG_ROLES,
      default: "member",
      required: true,
    },
    status: {
      type: String,
      enum: ORG_MEMBER_STATUSES,
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

const OrgSettingsSchema = new mongoose.Schema(
  {
    displayName: { type: String, default: "", trim: true, maxlength: 120 },
    defaultTimezone: { type: String, default: "", trim: true, maxlength: 80 },
    allowMemberInvites: { type: Boolean, default: true },
    requireAdminForSharedProjects: { type: Boolean, default: false },
  },
  { _id: false }
);

const OrganizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    /**
     * Soft seat cap for the org. -1 = unlimited (Enterprise default).
     * Used is derived from active members — not stored separately.
     */
    seatLimit: {
      type: Number,
      default: 10,
      min: -1,
    },
    members: {
      type: [OrgMemberSchema],
      default: [],
    },
    settings: {
      type: OrgSettingsSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

OrganizationSchema.index({ "members.user": 1, updatedAt: -1 });

export default mongoose.models.Organization ||
  mongoose.model("Organization", OrganizationSchema);
