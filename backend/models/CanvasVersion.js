import mongoose from "mongoose";
import { CANVAS_TYPES } from "./Canvas.js";

const CanvasVersionSchema = new mongoose.Schema(
  {
    canvas: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Canvas",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    revision: {
      type: Number,
      required: true,
      min: 1,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "Untitled",
    },
    type: {
      type: String,
      enum: CANVAS_TYPES,
      required: true,
    },
    language: {
      type: String,
      trim: true,
      maxlength: 40,
      default: null,
    },
    content: {
      type: String,
      default: "",
      maxlength: 2_000_000,
    },
    /** autosave | manual | restore | ai | duplicate */
    source: {
      type: String,
      enum: ["autosave", "manual", "restore", "ai", "duplicate", "create"],
      default: "autosave",
    },
    note: {
      type: String,
      trim: true,
      maxlength: 400,
      default: "",
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

CanvasVersionSchema.index({ canvas: 1, revision: -1 }, { unique: true });
CanvasVersionSchema.index({ user: 1, canvas: 1, createdAt: -1 });

export default mongoose.model("CanvasVersion", CanvasVersionSchema);
