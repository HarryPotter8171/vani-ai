import fs from "fs/promises";
import { resolveUploadedFile } from "../fileService.js";
import { extractPdfStructure } from "./extract/pages.js";
import { classifyDocumentType } from "./classify/documentType.js";
import { chunkPdfPages } from "./chunk/pageChunker.js";
import { buildChunkIndex } from "./search/search.js";
import {
  readPdfIntelCache,
  writePdfIntelCache,
  readPdfIntelIndex,
  writePdfIntelIndex,
} from "./cache.js";
import { UnsupportedPdfError } from "./errors.js";

/**
 * Full PDF Intelligence analysis pipeline.
 * Memory-efficient: page-level extraction + chunked indexing (never one giant prompt).
 *
 * @param {string} id - Upload UUID
 * @param {{ force?: boolean, onProgress?: Function, buildIndex?: boolean }} [options]
 */
export async function analyzeUploadedPdf(id, options = {}) {
  const force = Boolean(options.force);
  const buildIndex = options.buildIndex !== false;
  const onProgress = options.onProgress;

  if (!force) {
    const cached = await readPdfIntelCache(id);
    if (cached?.id === id && Array.isArray(cached.pages)) {
      let index = null;
      if (buildIndex) {
        index = await readPdfIntelIndex(id);
      }
      onProgress?.({ stage: "cached", message: "Loaded cached analysis." });
      return { analysis: { ...cached, cached: true }, index };
    }
  }

  const file = await resolveUploadedFile(id);
  const isPdf =
    file.mimeType === "application/pdf" ||
    /\.pdf$/i.test(file.filename || "");
  if (!isPdf) {
    throw new UnsupportedPdfError(
      `“${file.filename}” is not a PDF. PDF Intelligence only accepts PDF files.`
    );
  }

  const buffer = await fs.readFile(file.absolutePath);

  const extracted = await extractPdfStructure(buffer, {
    filename: file.filename,
    onProgress,
  });

  onProgress?.({ stage: "classifying", message: "Detecting document type..." });
  const semanticType = classifyDocumentType(extracted.sampleText, {
    pageCount: extracted.pageCount,
    filename: file.filename,
  });

  onProgress?.({ stage: "chunking", message: "Chunking for search..." });
  const chunks = chunkPdfPages(extracted.pages);

  const analysis = {
    id: file.id,
    filename: file.filename,
    mimeType: file.mimeType,
    size: file.size,
    pageCount: extracted.pageCount,
    totalChars: extracted.totalChars,
    semanticType,
    // Keep format-level type for compatibility with understand consumers
    documentType: "pdf",
    pages: extracted.pages,
    headings: extracted.headings,
    tables: extracted.tables,
    forms: extracted.forms,
    images: extracted.images,
    metadata: extracted.metadata,
    warnings: extracted.warnings || [],
    chunkCount: chunks.length,
    capabilities: {
      qa: true,
      search: true,
      tables: extracted.tables.length > 0,
      forms: extracted.forms.length > 0,
      citations: true,
      streaming: true,
      multiPageReasoning: true,
    },
    analyzedAt: new Date().toISOString(),
  };

  let index = null;
  if (buildIndex && chunks.length) {
    index = await buildChunkIndex(chunks, { onProgress });
    try {
      await writePdfIntelIndex(id, index);
    } catch (err) {
      console.error("pdfIntelligence index write failed:", err.message);
    }
  }

  try {
    await writePdfIntelCache(id, analysis);
  } catch (err) {
    console.error("pdfIntelligence cache write failed:", err.message);
  }

  onProgress?.({ stage: "done", message: "Analysis complete." });
  return { analysis: { ...analysis, cached: false }, index };
}

/**
 * Ensure analysis (+ optional index) exists for a file id.
 */
export async function ensurePdfAnalysis(id, options = {}) {
  return analyzeUploadedPdf(id, options);
}
