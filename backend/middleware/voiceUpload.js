import multer from "multer";
import { STT_ALLOWED_MIME, STT_MAX_AUDIO_BYTES } from "../services/speechToText/config.js";

const storage = multer.memoryStorage();

function isAllowedAudioMime(mime) {
  if (!mime) return false;
  if (STT_ALLOWED_MIME.has(mime)) return true;
  // Browsers sometimes append codecs; compare base type.
  const base = mime.split(";")[0].trim().toLowerCase();
  return STT_ALLOWED_MIME.has(base) || base.startsWith("audio/");
}

/**
 * Multipart audio upload for STT. Field name: "audio".
 */
export const voiceAudioUpload = multer({
  storage,
  limits: {
    fileSize: STT_MAX_AUDIO_BYTES,
    files: 1,
  },
  fileFilter(_req, file, cb) {
    if (!isAllowedAudioMime(file.mimetype)) {
      const err = new Error(`Unsupported audio type: ${file.mimetype || "unknown"}`);
      err.status = 400;
      err.code = "UNSUPPORTED_AUDIO";
      return cb(err);
    }
    return cb(null, true);
  },
}).single("audio");

/**
 * Express error wrapper for multer voice uploads.
 */
export function handleVoiceUploadError(err, _req, res, next) {
  if (!err) return next();

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: "Audio is too large. Keep clips under 10 MB.",
        code: "AUDIO_TOO_LARGE",
      });
    }
    return res.status(400).json({
      error: "Invalid audio upload.",
      code: err.code || "UPLOAD_ERROR",
    });
  }

  if (err.code === "UNSUPPORTED_AUDIO") {
    return res.status(400).json({
      error: err.message,
      code: err.code,
    });
  }

  return next(err);
}
