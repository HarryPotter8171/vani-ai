const DEFAULT_CHUNK_CHARS = 2800;
const DEFAULT_OVERLAP = 280;

export function estimateTokens(text = "") {
  // Rough heuristic — good enough for context budgeting.
  return Math.ceil(String(text).length / 4);
}

/**
 * Split text into overlapping chunks for RAG indexing.
 */
export function chunkText(text, { chunkChars = DEFAULT_CHUNK_CHARS, overlap = DEFAULT_OVERLAP } = {}) {
  const normalized = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) return [];

  if (normalized.length <= chunkChars) {
    return [
      {
        chunkIndex: 0,
        content: normalized,
        tokenEstimate: estimateTokens(normalized),
      },
    ];
  }

  const chunks = [];
  let start = 0;
  let index = 0;

  while (start < normalized.length) {
    let end = Math.min(start + chunkChars, normalized.length);

    // Prefer breaking on paragraph / sentence boundaries.
    if (end < normalized.length) {
      const window = normalized.slice(start, end);
      const breakAt =
        Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "), window.lastIndexOf("\n")) +
        (window.lastIndexOf(". ") >= 0 ? 1 : 0);
      if (breakAt > chunkChars * 0.4) {
        end = start + breakAt + 1;
      }
    }

    const content = normalized.slice(start, end).trim();
    if (content) {
      chunks.push({
        chunkIndex: index,
        content,
        tokenEstimate: estimateTokens(content),
      });
      index += 1;
    }

    if (end >= normalized.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}
