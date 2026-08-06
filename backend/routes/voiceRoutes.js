import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { usageGuard, usageGuardFeature } from "../middleware/usageGuard.js";
import {
  voiceAudioUpload,
  handleVoiceUploadError,
} from "../middleware/voiceUpload.js";
import {
  STT_RATE_LIMIT_MAX,
  STT_RATE_LIMIT_WINDOW_MS,
} from "../services/speechToText/config.js";
import {
  TTS_RATE_LIMIT_MAX,
  TTS_RATE_LIMIT_WINDOW_MS,
} from "../services/textToSpeech/config.js";
import {
  SESSION_RATE_LIMIT_MAX,
  SESSION_RATE_LIMIT_WINDOW_MS,
} from "../services/voiceSession/config.js";
import {
  createVoiceSession,
  getVoiceSession,
  patchVoiceSession,
  deleteVoiceSession,
  listVoices,
  speechToText,
  textToSpeech,
  interruptVoice,
} from "../controllers/voiceController.js";
import { voiceService } from "../services/voice/index.js";

const router = express.Router();

const sessionRateLimit = createRateLimiter({
  windowMs: SESSION_RATE_LIMIT_WINDOW_MS,
  max: SESSION_RATE_LIMIT_MAX,
  message: "Too many voice sessions. Please wait a moment.",
});

const sttRateLimit = createRateLimiter({
  windowMs: STT_RATE_LIMIT_WINDOW_MS,
  max: STT_RATE_LIMIT_MAX,
  message: "Too many transcription requests. Please wait a moment.",
});

const ttsRateLimit = createRateLimiter({
  windowMs: TTS_RATE_LIMIT_WINDOW_MS,
  max: TTS_RATE_LIMIT_MAX,
  message: "Too many speech requests. Please wait a moment.",
});

/** Voice health / capability probe (public). */
router.get("/health", (_req, res) => {
  res.json(voiceService.capabilities());
});

router.use(requireAuth);
router.use(usageGuardFeature("voice"));

router.get("/voices", listVoices);

router.post(
  "/session",
  usageGuard("voice"),
  sessionRateLimit,
  createVoiceSession
);
router.get("/session/:id", getVoiceSession);
router.patch("/session/:id", patchVoiceSession);
router.delete("/session/:id", deleteVoiceSession);

router.post(
  "/stt",
  usageGuard("voice"),
  sttRateLimit,
  (req, res, next) => {
    voiceAudioUpload(req, res, (err) => {
      if (err) return handleVoiceUploadError(err, req, res, next);
      return next();
    });
  },
  speechToText
);

router.post("/tts", usageGuard("voice"), ttsRateLimit, textToSpeech);
router.post("/interrupt", interruptVoice);

export default router;
