import path from "path";
import { toPublicErrorMessage } from "../utils/errors.js";
import {
  removeUploadedFiles,
  resolveStoredKind,
  resolveStoredMimeType,
  sanitizeOriginalName,
} from "../middleware/upload.js";
import { kindForExtension } from "../config/upload.js";
import { validateStoredFileSignature } from "../utils/fileSignatures.js";
import { signFileAccessToken } from "../utils/jwt.js";
import {
  deleteUploadedFile,
  parseUploadedFile,
  processUploadedImage,
  resolveOwnedUploadedFile,
  writeUploadMetadata,
  UnsupportedFormatError,
  ParseFailedError,
  UnsupportedImageError,
  ImageProcessingError,
} from "../services/fileService.js";
import {
  understandUploadedDocument,
  UnsupportedDocumentError,
  DocumentUnderstandingError,
} from "../services/documentUnderstanding/index.js";
import { normalizeUploadedImage } from "../services/vision/visionService.js";

/** Public metadata — never expose filesystem paths. */
function publicFileMeta(meta) {
  return {
    id: meta.id,
    filename: meta.filename,
    size: meta.size,
    mimeType: meta.mimeType,
    kind: meta.kind,
    createdAt: meta.createdAt,
  };
}

async function assertOwnedFile(req) {
  const ownerId = req.user.id;
  return resolveOwnedUploadedFile(req.params.id, ownerId);
}

/**
 * POST /api/files/upload
 * Persists multipart files to disk, verifies content signatures,
 * and returns metadata only — contents are intentionally not parsed here.
 * Downstream OCR / Vision / PDF tools resolve files by `id`.
 */
export const uploadFiles = async (req, res) => {
  const uploaded = req.files || [];
  const acceptedIds = [];
  const ownerId = req.user.id;

  try {
    if (uploaded.length === 0) {
      return res.status(400).json({
        error: 'No files uploaded. Attach one or more files under the "files" form field.',
      });
    }

    const files = [];

    for (const file of uploaded) {
      const signature = await validateStoredFileSignature(file.path, file.originalname);
      if (!signature.ok) {
        await removeUploadedFiles(uploaded);
        await Promise.all(acceptedIds.map((id) => deleteUploadedFile(id)));
        return res.status(400).json({
          error: `“${sanitizeOriginalName(file.originalname)}” failed validation. ${signature.error}`,
        });
      }

      const id = file.uploadId || path.parse(file.filename).name;
      const relativePath = path.posix.join("uploads", file.filename);
      const meta = {
        id,
        ownerId,
        filename: sanitizeOriginalName(file.originalname),
        size: file.size,
        mimeType: resolveStoredMimeType(file),
        kind: resolveStoredKind(file),
        path: relativePath,
      };
      const stored = await writeUploadMetadata(meta);
      acceptedIds.push(id);

      // Vision: convert HEIC / GIF (first frame) / BMP and compress large images
      // so Gemini always receives JPEG/PNG/WEBP. Non-images are untouched.
      let publicMeta = publicFileMeta(stored);
      if (stored.kind === "image") {
        try {
          const { normalized, file: normalizedFile } = await normalizeUploadedImage(id);
          if (normalized && normalizedFile) {
            publicMeta = publicFileMeta(normalizedFile);
          }
        } catch (normErr) {
          console.error("uploadFiles normalize:", id, normErr.message);
          // Keep original bytes — understand / chat may still recover.
        }
      }

      files.push(publicMeta);
    }

    res.status(201).json({ files });
  } catch (err) {
    await removeUploadedFiles(uploaded);
    await Promise.all(acceptedIds.map((id) => deleteUploadedFile(id)));
    console.error("uploadFiles:", err);
    res.status(500).json({ error: "Unable to upload files." });
  }
};

/**
 * DELETE /api/files/:id
 * Owner-scoped cleanup for composer cancel / remove (and tests).
 * Best-effort: removes binary + sidecar + understand/vision/pdf caches.
 */
export const deleteFile = async (req, res) => {
  try {
    await assertOwnedFile(req);
    await deleteUploadedFile(req.params.id);
    return res.status(204).send();
  } catch (err) {
    if (err.code === "INVALID_ID") {
      return res.status(400).json({ error: toPublicErrorMessage(err) });
    }
    if (err.code === "NOT_FOUND") {
      return res.status(404).json({ error: "File not found." });
    }
    console.error("deleteFile:", err);
    res.status(500).json({ error: "Unable to delete file." });
  }
};

/**
 * GET /api/files/:id
 * Return stored metadata for an uploaded file (no binary body).
 */
export const getFileMetadata = async (req, res) => {
  try {
    const file = await assertOwnedFile(req);
    res.json({
      file: publicFileMeta({
        id: file.id,
        filename: file.filename,
        size: file.size,
        mimeType: file.mimeType,
        kind: file.kind || kindForExtension(path.extname(file.filename)),
        createdAt: file.createdAt,
      }),
    });
  } catch (err) {
    if (err.code === "INVALID_ID") {
      return res.status(400).json({ error: toPublicErrorMessage(err) });
    }
    if (err.code === "NOT_FOUND") {
      return res.status(404).json({ error: "File not found." });
    }
    console.error("getFileMetadata:", err);
    res.status(500).json({ error: "Unable to load file metadata." });
  }
};

/**
 * GET /api/files/:id/signed-url
 * Short-lived signed URL for <img src> / download without exposing a long-lived session JWT.
 */
export const getSignedFileUrl = async (req, res) => {
  try {
    const file = await assertOwnedFile(req);
    const token = await signFileAccessToken({
      fileId: file.id,
      userId: req.user.id,
    });
    const download =
      req.query.download === "1" || req.query.download === "true" ? "&download=1" : "";
    // Path relative to /api — frontend prepends API_BASE_URL.
    const url = `files/${encodeURIComponent(file.id)}/content?access_token=${encodeURIComponent(token)}${download}`;
    res.json({ url, expiresIn: 900 });
  } catch (err) {
    if (err.code === "INVALID_ID") {
      return res.status(400).json({ error: toPublicErrorMessage(err) });
    }
    if (err.code === "NOT_FOUND") {
      return res.status(404).json({ error: "File not found." });
    }
    console.error("getSignedFileUrl:", err);
    res.status(500).json({ error: "Unable to sign file URL." });
  }
};

/**
 * POST /api/files/:id/parse
 */
export const parseFile = async (req, res) => {
  try {
    await assertOwnedFile(req);
    const result = await parseUploadedFile(req.params.id);
    res.json(result);
  } catch (err) {
    if (err.code === "INVALID_ID") {
      return res.status(400).json({ error: toPublicErrorMessage(err) });
    }
    if (err.code === "NOT_FOUND") {
      return res.status(404).json({ error: "File not found." });
    }
    if (err instanceof UnsupportedFormatError || err.code === "UNSUPPORTED_FORMAT") {
      return res.status(415).json({ error: toPublicErrorMessage(err) });
    }
    if (err instanceof ParseFailedError || err.code === "PARSE_FAILED") {
      return res.status(422).json({ error: toPublicErrorMessage(err) });
    }
    console.error("parseFile:", err);
    res.status(500).json({ error: "Unable to parse file." });
  }
};

/**
 * POST /api/files/:id/process-image
 */
export const processImageFile = async (req, res) => {
  try {
    await assertOwnedFile(req);
    const result = await processUploadedImage(req.params.id);
    res.json(result);
  } catch (err) {
    if (err.code === "INVALID_ID") {
      return res.status(400).json({ error: toPublicErrorMessage(err) });
    }
    if (err.code === "NOT_FOUND") {
      return res.status(404).json({ error: "File not found." });
    }
    if (err instanceof UnsupportedImageError || err.code === "UNSUPPORTED_IMAGE") {
      return res.status(415).json({ error: toPublicErrorMessage(err) });
    }
    if (err instanceof ImageProcessingError || err.code === "IMAGE_PROCESSING_FAILED") {
      return res.status(422).json({ error: toPublicErrorMessage(err) });
    }
    console.error("processImageFile:", err);
    res.status(500).json({ error: "Unable to process image." });
  }
};

/**
 * POST /api/files/:id/understand
 */
export const understandFile = async (req, res) => {
  try {
    await assertOwnedFile(req);
    const force =
      req.query?.force === "true" ||
      req.query?.force === "1" ||
      req.body?.force === true;
    const result = await understandUploadedDocument(req.params.id, { force });
    res.json(result);
  } catch (err) {
    if (err.code === "INVALID_ID") {
      return res.status(400).json({ error: toPublicErrorMessage(err) });
    }
    if (err.code === "NOT_FOUND") {
      return res.status(404).json({ error: "File not found." });
    }
    if (
      err instanceof UnsupportedDocumentError ||
      err.code === "UNSUPPORTED_DOCUMENT" ||
      err instanceof UnsupportedFormatError ||
      err.code === "UNSUPPORTED_FORMAT" ||
      err instanceof UnsupportedImageError ||
      err.code === "UNSUPPORTED_IMAGE"
    ) {
      return res.status(415).json({ error: toPublicErrorMessage(err) });
    }
    if (
      err instanceof DocumentUnderstandingError ||
      err.code === "UNDERSTANDING_FAILED" ||
      err instanceof ParseFailedError ||
      err.code === "PARSE_FAILED" ||
      err instanceof ImageProcessingError ||
      err.code === "IMAGE_PROCESSING_FAILED"
    ) {
      return res.status(422).json({ error: toPublicErrorMessage(err) });
    }
    console.error("understandFile:", err);
    res.status(500).json({ error: "Unable to analyze document." });
  }
};

/**
 * GET /api/files/:id/content
 * Stream the binary for durable chat previews / download.
 */
export const getFileContent = async (req, res) => {
  try {
    const file = await assertOwnedFile(req);
    const disposition =
      req.query.download === "1" || req.query.download === "true"
        ? "attachment"
        : "inline";
    const safeName = sanitizeOriginalName(file.filename).replace(/"/g, "");

    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    res.setHeader("Content-Length", String(file.size));
    res.setHeader("Content-Disposition", `${disposition}; filename="${safeName}"`);
    res.setHeader("Cache-Control", "private, max-age=900");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const { createReadStream } = await import("fs");
    const stream = createReadStream(file.absolutePath);
    stream.on("error", (err) => {
      console.error("getFileContent stream:", err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: "Unable to read file." });
      } else {
        res.destroy(err);
      }
    });
    stream.pipe(res);
  } catch (err) {
    if (err.code === "INVALID_ID") {
      return res.status(400).json({ error: toPublicErrorMessage(err) });
    }
    if (err.code === "NOT_FOUND") {
      return res.status(404).json({ error: "File not found." });
    }
    console.error("getFileContent:", err);
    res.status(500).json({ error: "Unable to load file." });
  }
};
