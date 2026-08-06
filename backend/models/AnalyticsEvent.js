import mongoose from "mongoose";

/**
 * Durable analytics log — API requests, model calls, tool invocations, errors.
 * Written asynchronously; never blocks the request path.
 */
export const ANALYTICS_EVENT_TYPES = [
  "api_request",
  "model_call",
  "tool_invocation",
  "error",
];

const AnalyticsEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ANALYTICS_EVENT_TYPES,
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    method: { type: String, default: "", trim: true, maxlength: 12 },
    path: { type: String, default: "", trim: true, maxlength: 240, index: true },
    statusCode: { type: Number, default: null, index: true },
    latencyMs: { type: Number, default: null, min: 0 },
    /** Feature / metric category when known (chat, mcp, voice, …). */
    category: { type: String, default: "", trim: true, maxlength: 64, index: true },
    /** Model id for model_call events. */
    model: { type: String, default: "", trim: true, maxlength: 120, index: true },
    /** Tool name for tool_invocation events. */
    tool: { type: String, default: "", trim: true, maxlength: 120, index: true },
    tokens: { type: Number, default: 0, min: 0 },
    errorMessage: { type: String, default: "", trim: true, maxlength: 500 },
    requestId: { type: String, default: "", trim: true, maxlength: 80, index: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AnalyticsEventSchema.index({ createdAt: -1 });
AnalyticsEventSchema.index({ user: 1, createdAt: -1 });
AnalyticsEventSchema.index({ type: 1, createdAt: -1 });
/** TTL — keep ~90 days of raw events (override via VANI_ANALYTICS_TTL_DAYS). */
const ttlDays = Number(process.env.VANI_ANALYTICS_TTL_DAYS) || 90;
AnalyticsEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: Math.max(1, Math.floor(ttlDays * 86400)) }
);

export default mongoose.models.AnalyticsEvent ||
  mongoose.model("AnalyticsEvent", AnalyticsEventSchema);
