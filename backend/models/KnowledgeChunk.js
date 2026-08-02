import mongoose from "mongoose";

const KnowledgeChunkSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    file: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProjectFile",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
    },
    chunkIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    content: {
      type: String,
      required: true,
    },
    tokenEstimate: {
      type: Number,
      default: 0,
    },
    /** Dense embedding from text-embedding-004 (or configured model). */
    embedding: {
      type: [Number],
      default: undefined,
      select: false, // avoid loading vectors unless needed
    },
    embeddingModel: {
      type: String,
      default: "text-embedding-004",
    },
  },
  { timestamps: true }
);

// Hot path: filter by project then score in-app / Atlas vector search.
KnowledgeChunkSchema.index({ project: 1, file: 1, chunkIndex: 1 });
KnowledgeChunkSchema.index({ project: 1, createdAt: -1 });

export default mongoose.model("KnowledgeChunk", KnowledgeChunkSchema);
