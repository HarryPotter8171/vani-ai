import mongoose from "mongoose";

const ProjectFileSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 260,
    },
    mimeType: {
      type: String,
      default: "application/octet-stream",
    },
    kind: {
      type: String,
      enum: ["image", "pdf", "docx", "text", "markdown", "csv", "xlsx", "zip", "unknown"],
      default: "unknown",
    },
    size: {
      type: Number,
      default: 0,
    },
    /** Full extracted text for re-indexing (capped in service layer). */
    extractedText: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "indexing", "ready", "error"],
      default: "pending",
      index: true,
    },
    error: {
      type: String,
      default: "",
    },
    chunkCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

ProjectFileSchema.index({ project: 1, createdAt: -1 });
ProjectFileSchema.index({ project: 1, name: 1 });

export default mongoose.model("ProjectFile", ProjectFileSchema);
