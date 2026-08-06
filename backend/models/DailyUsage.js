import mongoose from "mongoose";

/**
 * Per-user daily rollups for analytics charts.
 * One document per (user, day UTC). Updated atomically via $inc.
 */
const DailyMetricsSchema = new mongoose.Schema(
  {
    chat_requests: { type: Number, default: 0, min: 0 },
    tokens: { type: Number, default: 0, min: 0 },
    image_generation: { type: Number, default: 0, min: 0 },
    voice_minutes: { type: Number, default: 0, min: 0 },
    research_runs: { type: Number, default: 0, min: 0 },
    browser_sessions: { type: Number, default: 0, min: 0 },
    code_executions: { type: Number, default: 0, min: 0 },
    mcp_calls: { type: Number, default: 0, min: 0 },
    file_storage_bytes: { type: Number, default: 0, min: 0 },
    api_requests: { type: Number, default: 0, min: 0 },
    errors: { type: Number, default: 0, min: 0 },
    latency_sum_ms: { type: Number, default: 0, min: 0 },
    latency_count: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const DailyUsageSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /** UTC calendar day at 00:00:00. */
    day: { type: Date, required: true, index: true },
    metrics: { type: DailyMetricsSchema, default: () => ({}) },
    /** modelId → token count */
    models: { type: Map, of: Number, default: undefined },
  },
  { timestamps: true }
);

DailyUsageSchema.index({ user: 1, day: 1 }, { unique: true });
DailyUsageSchema.index({ day: 1 });

export default mongoose.models.DailyUsage ||
  mongoose.model("DailyUsage", DailyUsageSchema);
