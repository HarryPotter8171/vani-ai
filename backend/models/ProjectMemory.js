import mongoose from "mongoose";

export const MEMORY_CATEGORIES = [
  "preference",
  "writing_style",
  "coding_style",
  "goal",
  "decision",
  "fact",
  "other",
];

const ProjectMemorySchema = new mongoose.Schema(
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
    category: {
      type: String,
      enum: MEMORY_CATEGORIES,
      default: "fact",
      index: true,
    },
    key: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    value: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
  },
  { timestamps: true }
);

ProjectMemorySchema.index({ project: 1, category: 1, updatedAt: -1 });
ProjectMemorySchema.index({ project: 1, key: 1 }, { unique: true });

export default mongoose.model("ProjectMemory", ProjectMemorySchema);
