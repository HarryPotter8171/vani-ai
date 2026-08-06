import mongoose from "mongoose";

const TimelineEntrySchema = new mongoose.Schema(
  {
    id: String,
    at: Number,
    kind: String,
    label: String,
    detail: String,
    status: String,
    phase: String,
  },
  { _id: false }
);

const SourceSchema = new mongoose.Schema(
  {
    citationId: Number,
    citationLabel: String,
    title: String,
    url: String,
    snippet: String,
    score: Number,
    ok: Boolean,
    provider: String,
    error: String,
  },
  { _id: false }
);

const CitationSchema = new mongoose.Schema(
  {
    id: Number,
    label: String,
    title: String,
    url: String,
    snippet: String,
    score: Number,
    provider: String,
    hostname: String,
  },
  { _id: false }
);

const ContradictionSchema = new mongoose.Schema(
  {
    claim: String,
    sides: [String],
    severity: { type: String, enum: ["low", "medium", "high"], default: "medium" },
  },
  { _id: false }
);

const ResearchSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      default: null,
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },
    query: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: [
        "idle",
        "planning",
        "searching",
        "reading",
        "comparing",
        "verifying",
        "writing",
        "completed",
        "failed",
        "cancelled",
        "paused",
      ],
      default: "idle",
      index: true,
    },
    phase: { type: String, default: null },
    progress: { type: Number, default: 0 },
    plan: { type: mongoose.Schema.Types.Mixed, default: null },
    sources: { type: [SourceSchema], default: [] },
    timeline: { type: [TimelineEntrySchema], default: [] },
    contradictions: { type: [ContradictionSchema], default: [] },
    citations: { type: [CitationSchema], default: [] },
    followUpQuestions: { type: [String], default: [] },
    providers: { type: [String], default: [] },
    report: { type: String, default: "" },
    confidence: { type: Number, default: null },
    error: { type: String, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ResearchSchema.index({ user: 1, updatedAt: -1 });

const Research = mongoose.models.Research || mongoose.model("Research", ResearchSchema);
export default Research;
