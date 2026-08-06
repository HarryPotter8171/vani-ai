import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import {
  ALLOWED_EXTENSIONS,
  CANONICAL_MIME_BY_EXT,
  EXTENSION_MIME_MAP,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES,
  MAX_TOTAL_SIZE_BYTES,
  UPLOADS_DIR,
  kindForExtension,
} from "../config/upload.js";

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function getExtension(originalname = "") {
  return path.extname(originalname).toLowerCase();
}

/** Strip path segments / control chars; keep a safe display name. */
export function sanitizeOriginalName(originalname = "") {
  const base = path.basename(String(originalname)).replace(/[\x00-\x1f\x7f]/g, "").trim();
  return base.slice(0, 255) || "file";
}

/**
 * Decide whether a Multer file is allowed.
 * Requires a known extension, and a MIME that either matches that extension
 * or is empty / application/octet-stream (canonicalized later).
 */
export function isAllowedUpload(file) {
  const ext = getExtension(file.originalname);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: `Unsupported file extension: ${ext || "(none)"}.` };
  }

  const mime = String(file.mimetype || "").toLowerCase().trim();
  const allowedMimes = EXTENSION_MIME_MAP[ext];

  if (!mime || mime === "application/octet-stream") {
    return { ok: true, ext, mime: CANONICAL_MIME_BY_EXT[ext] };
  }

  if (!allowedMimes.includes(mime)) {
    return {
      ok: false,
      error: `MIME type "${mime}" is not allowed for ${ext} files.`,
    };
  }

  return { ok: true, ext, mime: CANONICAL_MIME_BY_EXT[ext] };
}

export function resolveStoredMimeType(file) {
  const ext = getExtension(file.originalname);
  const mime = String(file.mimetype || "").toLowerCase().trim();
  if (mime && mime !== "application/octet-stream" && EXTENSION_MIME_MAP[ext]?.includes(mime)) {
    return CANONICAL_MIME_BY_EXT[ext] || mime;
  }
  return CANONICAL_MIME_BY_EXT[ext] || mime || "application/octet-stream";
}

export function resolveStoredKind(file) {
  return kindForExtension(getExtension(file.originalname));
}

/** Best-effort unlink of Multer temp files after a rejected request. */
export async function removeUploadedFiles(files = []) {
  await Promise.all(
    files.map(async (file) => {
      if (!file?.path) return;
      try {
        await fs.promises.unlink(file.path);
      } catch (err) {
        if (err.code !== "ENOENT") {
          console.error("removeUploadedFiles:", file.path, err.message);
        }
      }
    })
  );
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename(_req, file, cb) {
    const ext = getExtension(file.originalname);
    const id = crypto.randomUUID();
    // Stash id on the file object so the controller doesn't re-parse the name.
    file.uploadId = id;
    cb(null, `${id}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  const result = isAllowedUpload(file);
  if (!result.ok) {
    return cb(new Error(result.error));
  }
  // Sanitize originalname in-place so disk / metadata never see path traversal.
  file.originalname = sanitizeOriginalName(file.originalname);
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_FILES,
    // Guard oversized multipart envelopes (fields + files).
    fieldSize: 64 * 1024,
  },
});

/**
 * Multipart field name is `files` (up to MAX_FILES).
 * Wraps Multer so LIMIT_* and filter errors become calm JSON 400s.
 * Also enforces a soft total-size budget across the batch.
 */
export function uploadFilesMiddleware(req, res, next) {
  upload.array("files", MAX_FILES)(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            error: `Each file must be ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB or smaller.`,
          });
        }
        if (err.code === "LIMIT_FILE_COUNT") {
          return res.status(400).json({
            error: `You can upload up to ${MAX_FILES} files at a time.`,
          });
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({
            error: 'Unexpected form field. Use "files" as the field name.',
          });
        }
        return res.status(400).json({ error: err.message || "Upload failed." });
      }

      return res.status(400).json({ error: err.message || "Upload failed." });
    }

    const files = req.files || [];
    const total = files.reduce((sum, f) => sum + (f.size || 0), 0);
    if (total > MAX_TOTAL_SIZE_BYTES) {
      await removeUploadedFiles(files);
      req.files = [];
      return res.status(400).json({
        error: `Total upload size exceeds ${MAX_TOTAL_SIZE_BYTES / (1024 * 1024)}MB.`,
      });
    }

    return next();
  });
}
