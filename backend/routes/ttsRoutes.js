import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import {
  textToSpeech,
  ELEVENLABS_RATE_LIMIT_MAX,
  ELEVENLABS_RATE_LIMIT_WINDOW_MS,
} from "../controllers/ttsController.js";

const router = express.Router();

const ttsRateLimit = createRateLimiter({
  windowMs: ELEVENLABS_RATE_LIMIT_WINDOW_MS,
  max: ELEVENLABS_RATE_LIMIT_MAX,
  message: "Too many speech requests. Please wait a moment.",
});

router.use(requireAuth);

/** POST /api/tts — stream ElevenLabs MP3 for message read-aloud. */
router.post("/", ttsRateLimit, textToSpeech);

export default router;
