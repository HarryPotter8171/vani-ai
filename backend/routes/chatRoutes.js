import express from "express";
import {
  createChat,
  createOrUpdateChat,
  deleteChat,
  generateChatTitleForChat,
  getAllChats,
  getChatById,
  getChatShareStatus,
  getSharedChat,
  pinChat,
  renameChat,
  shareChat,
  unpinChat,
  unshareChat,
  updateChatTitle,
} from "../controllers/chatController.js";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { usageGuard } from "../middleware/usageGuard.js";
import { CHAT_PUBLIC_RATE_LIMIT, CHAT_RATE_LIMIT } from "../config/rateLimits.js";

const router = express.Router();

const chatPublicRateLimit = createRateLimiter({
  ...CHAT_PUBLIC_RATE_LIMIT,
  message: "Too many requests. Please try again shortly.",
  prefix: "rl:chat:public",
});

const chatRateLimit = createRateLimiter({
  ...CHAT_RATE_LIMIT,
  message: "Too many chat requests. Please slow down and try again shortly.",
  keyFn: (req) => req.user?.id || req.ip || "unknown",
  prefix: "rl:chat",
});

// Public, unauthenticated read-only view — must stay before /:id.
router.get("/shared/:shareId", chatPublicRateLimit, getSharedChat);

// Everything else requires a verified session JWT.
router.use(requireAuth);
router.use(chatRateLimit);

router.get("/list", getAllChats);
router.post("/new", createChat);

router.get("/:id", getChatById);
router.patch("/:id/title", updateChatTitle);
router.post("/:id/generate-title", generateChatTitleForChat);
router.post("/:id/pin", pinChat);
router.post("/:id/unpin", unpinChat);
router.get("/:id/share", getChatShareStatus);
router.post("/:id/share", shareChat);
router.post("/:id/unshare", unshareChat);
router.delete("/:id", deleteChat);

router.put("/:id", renameChat); // legacy alias

router.post("/", usageGuard("chat"), createOrUpdateChat);

export default router;
