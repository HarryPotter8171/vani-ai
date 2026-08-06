/**
 * Tunables for PDF Intelligence.
 * Env overrides keep production knobs out of code.
 */

/** Hard cap — documents above this return a friendly error. */
export const PDF_MAX_PAGES = Number(process.env.VANI_PDF_INTEL_MAX_PAGES) || 500;

/** Soft warning threshold (still processed). */
export const PDF_WARN_PAGES = Number(process.env.VANI_PDF_INTEL_WARN_PAGES) || 200;

/** Max characters retained per page in the analysis cache. */
export const PDF_PAGE_MAX_CHARS =
  Number(process.env.VANI_PDF_INTEL_PAGE_MAX_CHARS) || 8_000;

/** Max characters injected into a single LLM prompt for Q&A. */
export const PDF_QA_CONTEXT_CHARS =
  Number(process.env.VANI_PDF_INTEL_QA_CONTEXT_CHARS) || 24_000;

/** Top-k chunks retrieved for semantic Q&A / search. */
export const PDF_SEARCH_TOP_K = Number(process.env.VANI_PDF_INTEL_TOP_K) || 8;

/** Minimum cosine similarity for semantic hits. */
export const PDF_SEARCH_MIN_SCORE =
  Number(process.env.VANI_PDF_INTEL_MIN_SCORE) || 0.12;

/** Chunk size (chars) for page-aware RAG indexing. */
export const PDF_CHUNK_CHARS = Number(process.env.VANI_PDF_INTEL_CHUNK_CHARS) || 1_800;

/** Overlap between adjacent chunks. */
export const PDF_CHUNK_OVERLAP =
  Number(process.env.VANI_PDF_INTEL_CHUNK_OVERLAP) || 200;

/** Max conversation turns retained for follow-up Q&A. */
export const PDF_CONVERSATION_MAX_TURNS =
  Number(process.env.VANI_PDF_INTEL_CONV_TURNS) || 12;

/** Conversation TTL (ms). */
export const PDF_CONVERSATION_TTL_MS =
  Number(process.env.VANI_PDF_INTEL_CONV_TTL_MS) || 60 * 60 * 1000;

/** Rate limit for PDF intelligence endpoints. */
export const PDF_INTEL_RATE_LIMIT_WINDOW_MS = 60_000;
export const PDF_INTEL_RATE_LIMIT_MAX = 20;

/** Chat model for generative Q&A (falls back to extractive when unavailable). */
export const PDF_QA_MODEL =
  process.env.VANI_PDF_INTEL_MODEL || process.env.VANI_CHAT_MODEL || "gemini-2.5-flash";
