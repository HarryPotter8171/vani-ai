import express from "express";
import { getAllChats } from "../controllers/chatController.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// Legacy alias — superseded by GET /api/chat/list.
router.get("/chats", requireAuth, getAllChats);

export default router;
