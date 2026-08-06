/**
 * VANI PDF Intelligence — production-grade PDF analysis, search, and Q&A.
 *
 * Additive layer on top of document understanding. Does not modify chat,
 * OCR tool, memory, or authentication paths.
 */

export {
  PDF_MAX_PAGES,
  PDF_WARN_PAGES,
  PDF_INTEL_RATE_LIMIT_MAX,
  PDF_INTEL_RATE_LIMIT_WINDOW_MS,
} from "./config.js";

export {
  PdfIntelligenceError,
  PasswordProtectedPdfError,
  CorruptedPdfError,
  UnsupportedPdfError,
  HugePdfError,
  mapPdfParseError,
} from "./errors.js";

export { analyzeUploadedPdf, ensurePdfAnalysis } from "./analyze.js";
export { askPdfQuestion } from "./qa/ask.js";
export { searchPdfIndex, findMentions, buildChunkIndex } from "./search/search.js";
export { classifyDocumentType, DOCUMENT_TYPES } from "./classify/documentType.js";
export { chunkPdfPages } from "./chunk/pageChunker.js";
export { extractPdfStructure } from "./extract/pages.js";
export {
  extractHeadings,
  extractTablesFromPages,
  extractForms,
  detectTextTables,
} from "./extract/structure.js";
export {
  getConversation,
  appendTurn,
  clearConversation,
} from "./session/conversation.js";
export { readPdfIntelCache, readPdfIntelIndex } from "./cache.js";

import { analyzeUploadedPdf } from "./analyze.js";
import { askPdfQuestion } from "./qa/ask.js";
import { searchPdfIndex, findMentions } from "./search/search.js";
import { clearConversation } from "./session/conversation.js";

/**
 * High-level: analyze (if needed) then answer a question with citations.
 */
export async function askAboutUploadedPdf(id, question, options = {}) {
  const { analysis, index } = await analyzeUploadedPdf(id, {
    force: options.force,
    onProgress: options.onProgress,
    buildIndex: true,
  });
  return askPdfQuestion({
    analysis,
    index,
    question,
    sessionId: options.sessionId || null,
    fileId: id,
    onProgress: options.onProgress,
  });
}

/**
 * High-level: semantic + keyword search inside an uploaded PDF.
 */
export async function searchUploadedPdf(id, query, options = {}) {
  const { analysis, index } = await analyzeUploadedPdf(id, {
    force: options.force,
    onProgress: options.onProgress,
    buildIndex: true,
  });

  const mentions = findMentions(analysis.pages || [], query);
  const hits = index
    ? await searchPdfIndex(index, query, {
        topK: options.topK,
        minScore: options.minScore,
      })
    : [];

  return {
    query,
    documentType: analysis.semanticType?.documentType,
    pageCount: analysis.pageCount,
    hits: hits.map((h) => ({
      pageStart: h.pageStart,
      pageEnd: h.pageEnd,
      score: Math.round((h.score || 0) * 1000) / 1000,
      matchType: h.matchType,
      snippet: String(h.content || "").slice(0, 400),
    })),
    mentions,
  };
}

/**
 * Return structured tables only.
 */
export async function getUploadedPdfTables(id, options = {}) {
  const { analysis } = await analyzeUploadedPdf(id, {
    force: options.force,
    buildIndex: false,
  });
  return {
    id: analysis.id,
    filename: analysis.filename,
    pageCount: analysis.pageCount,
    tables: analysis.tables || [],
  };
}

export { clearConversation as clearPdfConversation };
