import { PDF_CHUNK_CHARS, PDF_CHUNK_OVERLAP } from "../config.js";
import { estimateTokens } from "../../chunkingService.js";

/**
 * Page-aware chunking for memory-efficient RAG over large PDFs.
 * Never concatenates the entire document into one prompt-sized blob.
 *
 * Each chunk carries pageStart/pageEnd for citation grounding.
 *
 * @param {Array<{ page: number, text: string }>} pages
 * @param {{ chunkChars?: number, overlap?: number }} [options]
 */
export function chunkPdfPages(pages = [], options = {}) {
  const chunkChars = options.chunkChars ?? PDF_CHUNK_CHARS;
  const overlap = options.overlap ?? PDF_CHUNK_OVERLAP;
  const chunks = [];
  let index = 0;

  for (const page of pages) {
    const pageNum = page.page;
    const text = String(page.text || "").trim();
    if (!text) continue;

    if (text.length <= chunkChars) {
      chunks.push({
        chunkIndex: index,
        content: text,
        pageStart: pageNum,
        pageEnd: pageNum,
        tokenEstimate: estimateTokens(text),
      });
      index += 1;
      continue;
    }

    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + chunkChars, text.length);
      if (end < text.length) {
        const window = text.slice(start, end);
        const breakAt = Math.max(
          window.lastIndexOf("\n\n"),
          window.lastIndexOf(". "),
          window.lastIndexOf("\n")
        );
        if (breakAt > chunkChars * 0.4) {
          end = start + breakAt + 1;
        }
      }
      const content = text.slice(start, end).trim();
      if (content) {
        chunks.push({
          chunkIndex: index,
          content,
          pageStart: pageNum,
          pageEnd: pageNum,
          tokenEstimate: estimateTokens(content),
        });
        index += 1;
      }
      if (end >= text.length) break;
      start = Math.max(0, end - overlap);
    }
  }

  return chunks;
}
