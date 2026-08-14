/**
 * HTTP handlers for PDF Intelligence.
 * Additive endpoints under /api/files/:id/pdf/* — does not alter existing file APIs.
 */

import crypto from "node:crypto";
import { toPublicErrorMessage } from "../utils/errors.js";
import {
  analyzeUploadedPdf,
  askAboutUploadedPdf,
  searchUploadedPdf,
  getUploadedPdfTables,
  clearPdfConversation,
  PdfIntelligenceError,
  PasswordProtectedPdfError,
  CorruptedPdfError,
  UnsupportedPdfError,
  HugePdfError,
} from "../services/pdfIntelligence/index.js";
import { resolveOwnedUploadedFile } from "../services/fileService.js";

async function assertOwnedFile(req) {
  return resolveOwnedUploadedFile(req.params.id, req.user.id);
}

function mapError(res, err, fallback) {
  if (err.code === "INVALID_ID") {
    return res.status(400).json({ error: toPublicErrorMessage(err) });
  }
  if (err.code === "NOT_FOUND") {
    return res.status(404).json({ error: "File not found." });
  }
  if (
    err instanceof UnsupportedPdfError ||
    err.code === "PDF_UNSUPPORTED"
  ) {
    return res.status(415).json({ error: toPublicErrorMessage(err), code: err.code });
  }
  if (
    err instanceof PasswordProtectedPdfError ||
    err instanceof CorruptedPdfError ||
    err instanceof HugePdfError ||
    err instanceof PdfIntelligenceError ||
    err.code?.startsWith?.("PDF_")
  ) {
    return res.status(err.status || 422).json({
      error: toPublicErrorMessage(err),
      code: err.code,
      pageCount: err.pageCount,
      maxPages: err.maxPages,
    });
  }
  console.error(fallback, err);
  return res.status(500).json({ error: "Unable to process PDF." });
}

function publicAnalysis(analysis) {
  // Do not dump full page texts in the default analyze response (can be huge).
  // Clients that need pages can ask specifically via ask/search.
  return {
    id: analysis.id,
    filename: analysis.filename,
    mimeType: analysis.mimeType,
    size: analysis.size,
    pageCount: analysis.pageCount,
    totalChars: analysis.totalChars,
    documentType: analysis.documentType,
    semanticType: analysis.semanticType,
    headings: analysis.headings,
    tables: analysis.tables,
    forms: analysis.forms,
    images: analysis.images,
    metadata: analysis.metadata,
    warnings: analysis.warnings,
    chunkCount: analysis.chunkCount,
    capabilities: analysis.capabilities,
    analyzedAt: analysis.analyzedAt,
    cached: analysis.cached,
    // Lightweight page index (no full text)
    pageIndex: (analysis.pages || []).map((p) => ({
      page: p.page,
      charCount: p.charCount,
      preview: String(p.text || "").slice(0, 160),
    })),
  };
}

function writeSseHeaders(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  if (typeof res.flushHeaders === "function") res.flushHeaders();
}

function createSseSender(res) {
  let clientClosed = false;
  res.on("close", () => {
    if (!res.writableEnded) clientClosed = true;
  });
  return (payload) => {
    if (clientClosed || res.writableEnded) return;
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      clientClosed = true;
    }
  };
}

/**
 * POST /api/files/:id/pdf/analyze
 */
export const analyzePdf = async (req, res) => {
  try {
    await assertOwnedFile(req);
    const force =
      req.query?.force === "true" ||
      req.query?.force === "1" ||
      req.body?.force === true;
    const { analysis } = await analyzeUploadedPdf(req.params.id, { force });
    res.json(publicAnalysis(analysis));
  } catch (err) {
    mapError(res, err, "analyzePdf:");
  }
};

/**
 * POST /api/files/:id/pdf/analyze/stream
 * SSE progress: Reading PDF… → Extracting tables… → Analyzing… → done
 */
export const analyzePdfStream = async (req, res) => {
  writeSseHeaders(res);
  const send = createSseSender(res);

  try {
    await assertOwnedFile(req);
    const force =
      req.query?.force === "true" ||
      req.query?.force === "1" ||
      req.body?.force === true;

    const { analysis } = await analyzeUploadedPdf(req.params.id, {
      force,
      onProgress: (evt) => send({ type: "progress", ...evt }),
    });

    send({ type: "result", analysis: publicAnalysis(analysis) });
    send({ type: "done", done: true });
    res.end();
  } catch (err) {
    send({
      type: "error",
      error: toPublicErrorMessage(err, "Unable to analyze PDF."),
      code: err.code,
    });
    send({ type: "done", done: true });
    res.end();
  }
};

/**
 * POST /api/files/:id/pdf/ask
 * Body: { question, sessionId?, force? }
 */
export const askPdf = async (req, res) => {
  try {
    await assertOwnedFile(req);
    const question = String(req.body?.question || req.body?.query || "").trim();
    if (!question) {
      return res.status(400).json({ error: "question is required" });
    }
    if (question.length > 2000) {
      return res.status(400).json({ error: "Question too long (max 2000 chars)." });
    }

    const sessionId =
      String(req.body?.sessionId || "").trim() || crypto.randomUUID();
    const force = Boolean(req.body?.force);

    const result = await askAboutUploadedPdf(req.params.id, question, {
      sessionId,
      force,
    });

    res.json({ ...result, sessionId, fileId: req.params.id });
  } catch (err) {
    mapError(res, err, "askPdf:");
  }
};

/**
 * POST /api/files/:id/pdf/ask/stream
 */
export const askPdfStream = async (req, res) => {
  writeSseHeaders(res);
  const send = createSseSender(res);

  try {
    await assertOwnedFile(req);
    const question = String(req.body?.question || req.body?.query || "").trim();
    if (!question) {
      send({ type: "error", error: "question is required" });
      send({ type: "done", done: true });
      return res.end();
    }

    const sessionId =
      String(req.body?.sessionId || "").trim() || crypto.randomUUID();

    const result = await askAboutUploadedPdf(req.params.id, question, {
      sessionId,
      force: Boolean(req.body?.force),
      onProgress: (evt) => send({ type: "progress", ...evt }),
    });

    send({ type: "result", ...result, sessionId, fileId: req.params.id });
    send({ type: "done", done: true });
    res.end();
  } catch (err) {
    send({
      type: "error",
      error: toPublicErrorMessage(err, "Unable to answer."),
      code: err.code,
    });
    send({ type: "done", done: true });
    res.end();
  }
};

/**
 * POST /api/files/:id/pdf/search
 * Body: { query }
 */
export const searchPdf = async (req, res) => {
  try {
    await assertOwnedFile(req);
    const query = String(req.body?.query || req.body?.q || "").trim();
    if (!query) {
      return res.status(400).json({ error: "query is required" });
    }
    const result = await searchUploadedPdf(req.params.id, query, {
      force: Boolean(req.body?.force),
      topK: req.body?.topK,
    });
    res.json({ ...result, fileId: req.params.id });
  } catch (err) {
    mapError(res, err, "searchPdf:");
  }
};

/**
 * GET /api/files/:id/pdf/tables
 */
export const getPdfTables = async (req, res) => {
  try {
    await assertOwnedFile(req);
    const result = await getUploadedPdfTables(req.params.id, {
      force: req.query?.force === "true" || req.query?.force === "1",
    });
    res.json(result);
  } catch (err) {
    mapError(res, err, "getPdfTables:");
  }
};

/**
 * DELETE /api/files/:id/pdf/conversation
 * Body/query: sessionId
 */
export const clearPdfChat = async (req, res) => {
  try {
    await assertOwnedFile(req);
    const sessionId = String(
      req.body?.sessionId || req.query?.sessionId || ""
    ).trim();
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }
    clearPdfConversation(req.params.id, sessionId);
    res.json({ ok: true, sessionId });
  } catch (err) {
    mapError(res, err, "clearPdfChat:");
  }
};
