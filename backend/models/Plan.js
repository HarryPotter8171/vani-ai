import mongoose from "mongoose";

export const PLAN_IDS = ["free", "pro", "business", "enterprise"];

export const USAGE_METRICS = [
  "chat_requests",
  "tokens",
  "image_generation",
  "voice_minutes",
  "research_runs",
  "browser_sessions",
  "code_executions",
  "file_storage_bytes",
];

const QuotaSchema = new mongoose.Schema(
  {
    chat_requests: { type: Number, default: 0 },
    tokens: { type: Number, default: 0 },
    image_generation: { type: Number, default: 0 },
    voice_minutes: { type: Number, default: 0 },
    research_runs: { type: Number, default: 0 },
    browser_sessions: { type: Number, default: 0 },
    code_executions: { type: Number, default: 0 },
    file_storage_bytes: { type: Number, default: 0 },
  },
  { _id: false }
);

const PlanSchema = new mongoose.Schema(
  {
    planId: {
      type: String,
      required: true,
      unique: true,
      enum: PLAN_IDS,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: "", trim: true, maxlength: 500 },
    /** Display order (free → enterprise). */
    rank: { type: Number, default: 0, index: true },
    /** Monthly price in USD cents. 0 = free. Null = custom/contact sales. */
    priceMonthlyCents: { type: Number, default: 0 },
    priceYearlyCents: { type: Number, default: 0 },
    currency: { type: String, default: "usd", lowercase: true, maxlength: 8 },
    /** Soft monthly quotas. -1 = unlimited. */
    quotas: { type: QuotaSchema, default: () => ({}) },
    features: { type: [String], default: [] },
    isPublic: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.Plan || mongoose.model("Plan", PlanSchema);
