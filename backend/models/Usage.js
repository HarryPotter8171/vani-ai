import mongoose from "mongoose";
import { USAGE_METRICS } from "./Plan.js";

/**
 * Aggregated usage for a user within a billing period.
 * One document per (user, periodStart) — atomic $inc updates.
 */
const MetricsSchema = new mongoose.Schema(
  {
    chat_requests: { type: Number, default: 0, min: 0 },
    tokens: { type: Number, default: 0, min: 0 },
    image_generation: { type: Number, default: 0, min: 0 },
    voice_minutes: { type: Number, default: 0, min: 0 },
    research_runs: { type: Number, default: 0, min: 0 },
    browser_sessions: { type: Number, default: 0, min: 0 },
    code_executions: { type: Number, default: 0, min: 0 },
    file_storage_bytes: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const UsageSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    periodStart: { type: Date, required: true, index: true },
    periodEnd: { type: Date, required: true },
    metrics: { type: MetricsSchema, default: () => ({}) },
    /** Last recorded event timestamp for debugging. */
    lastEventAt: { type: Date, default: null },
  },
  { timestamps: true }
);

UsageSchema.index({ user: 1, periodStart: 1 }, { unique: true });

export { USAGE_METRICS };
export default mongoose.models.Usage || mongoose.model("Usage", UsageSchema);
