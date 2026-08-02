import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: "",
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    avatar: {
      type: String,
      default: "",
    },

    provider: {
      type: String,
      enum: ["google", "email"],
      default: "google",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("User", UserSchema);