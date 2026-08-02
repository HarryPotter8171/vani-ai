import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "./models/User.js";
import chatRoutes from "./routes/chatRoutes.js";
import projectRoutes from "./routes/projectRoutes.js";
import { initTools, listTools } from "./tools/index.js";

dotenv.config();

// Register model-callable tools at boot (fail fast if a tool is misconfigured).
initTools();
console.log(
  `✅ Tools ready: ${listTools({ includeDisabled: true })
    .map((t) => t.name)
    .join(", ")}`
);

// Dummy User Creation (Temporary)
async function createDummyUser() {
  let user = await User.findOne({ email: "admin@vani.ai" });
  if (!user) {
    user = await User.create({
      name: "Himanshu",
      email: "admin@vani.ai",
      provider: "email",
    });
    console.log("✅ Dummy User Created");
  }
  return user;
}

// Database Connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log("✅ MongoDB Connected");
    await createDummyUser();
  })
  .catch((err) => console.error("❌ MongoDB Error:", err));

const app = express();

// Middleware
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cache-Control", "Pragma"], 
}));
// Raised for multimodal chat payloads (base64 attachments).
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));

// Routes
app.get("/", (req, res) => res.send("Backend is running"));

// ⚡ FIX: "/" ko "/api" se replace kiya hai taaki frontend perfectly connect ho sake
app.use("/api", chatRoutes);
app.use("/api", projectRoutes);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));