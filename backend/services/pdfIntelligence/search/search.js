import { cosineSimilarity, embedQuery, embedTexts } from "../../embeddingService.js";
import {
  PDF_SEARCH_TOP_K,
  PDF_SEARCH_MIN_SCORE,
} from "../config.js";

/**
 * Build an embedding index for PDF chunks.
 * Soft-fails to keyword-only when embeddings are unavailable.
 */
export async function buildChunkIndex(chunks = [], { onProgress } = {}) {
  const emit = (stage, detail = {}) => {
    if (typeof onProgress === "function") {
      try {
        onProgress({ stage, ...detail });
      } catch {
        /* ignore */
      }
    }
  };

  emit("indexing", { message: "Building search index...", chunkCount: chunks.length });

  const entries = chunks.map((c) => ({
    chunkIndex: c.chunkIndex,
    content: c.content,
    pageStart: c.pageStart,
    pageEnd: c.pageEnd,
    embedding: null,
  }));

  try {
    const texts = entries.map((e) => e.content);
    // Embed in batches via embedTexts
    const vectors = await embedTexts(texts);
    for (let i = 0; i < entries.length; i += 1) {
      entries[i].embedding = vectors[i] || null;
    }
  } catch (err) {
    // Embeddings optional — keyword search still works.
    emit("indexing", {
      message: `Embedding unavailable (${err.message}) — keyword search only.`,
    });
  }

  return {
    chunks: entries,
    builtAt: new Date().toISOString(),
    hasEmbeddings: entries.some((e) => Array.isArray(e.embedding) && e.embedding.length),
  };
}

/**
 * Semantic + keyword hybrid search inside a PDF index.
 *
 * @returns {Array<{ content, pageStart, pageEnd, score, matchType }>}
 */
export async function searchPdfIndex(index, query, options = {}) {
  const topK = options.topK ?? PDF_SEARCH_TOP_K;
  const minScore = options.minScore ?? PDF_SEARCH_MIN_SCORE;
  const q = String(query || "").trim();
  if (!q || !index?.chunks?.length) return [];

  const keywordHits = keywordSearch(index.chunks, q, topK * 2);
  let semanticHits = [];

  if (index.hasEmbeddings) {
    try {
      const vector = await embedQuery(q);
      semanticHits = index.chunks
        .map((c) => ({
          content: c.content,
          pageStart: c.pageStart,
          pageEnd: c.pageEnd,
          score: cosineSimilarity(vector, c.embedding || []),
          matchType: "semantic",
        }))
        .filter((h) => h.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK * 2);
    } catch {
      // fall through to keyword
    }
  }

  return mergeHits(keywordHits, semanticHits, topK);
}

function keywordSearch(chunks, query, limit) {
  const terms = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1);
  if (!terms.length) return [];

  const hits = [];
  for (const c of chunks) {
    const lower = c.content.toLowerCase();
    let score = 0;
    const matched = [];
    for (const t of terms) {
      if (lower.includes(t)) {
        score += 1;
        matched.push(t);
      }
    }
    if (score === 0) continue;
    // Boost exact phrase
    if (lower.includes(query.toLowerCase())) score += 2;
    hits.push({
      content: c.content,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
      score: score / (terms.length + 2),
      matchType: "keyword",
      matchedTerms: matched,
    });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

function mergeHits(keywordHits, semanticHits, topK) {
  const map = new Map();
  for (const hit of [...semanticHits, ...keywordHits]) {
    const key = `${hit.pageStart}:${hit.content.slice(0, 80)}`;
    const existing = map.get(key);
    if (!existing || hit.score > existing.score) {
      map.set(key, {
        ...hit,
        matchType:
          existing && existing.matchType !== hit.matchType
            ? "hybrid"
            : hit.matchType,
      });
    } else if (existing && existing.matchType !== hit.matchType) {
      existing.matchType = "hybrid";
      existing.score = Math.max(existing.score, hit.score);
    }
  }
  return [...map.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}

/**
 * Find all page mentions of a term/phrase (for "Find all GST numbers" style).
 */
export function findMentions(pages = [], query = "") {
  const q = String(query || "").trim();
  if (!q) return [];

  const mentions = [];
  const isRegexIntent = /gst|invoice|pan|aadhaar|passport|policy/i.test(q);

  let patterns = [];
  if (/\bgst\b/i.test(q)) {
    patterns.push({
      label: "GSTIN",
      re: /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/gi,
    });
  }
  if (/invoice\s*(number|no|#)?/i.test(q)) {
    patterns.push({
      label: "Invoice number",
      re: /\b(?:invoice|inv)[\s#:.\-]*(?:no\.?|number|#)?[\s#:.\-]*([A-Z0-9\-\/]{3,})\b/gi,
    });
  }
  if (/\bpan\b/i.test(q)) {
    patterns.push({
      label: "PAN",
      re: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
    });
  }

  // Always also do literal case-insensitive search
  const literal = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  for (const page of pages) {
    const text = page.text || "";
    if (!text) continue;

    for (const { label, re } of patterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        mentions.push({
          page: page.page,
          label,
          match: m[0],
          snippet: snippetAround(text, m.index, m[0].length),
        });
        if (mentions.length > 200) return mentions;
      }
    }

    if (!isRegexIntent || patterns.length === 0) {
      const re = new RegExp(literal, "gi");
      let m;
      while ((m = re.exec(text)) !== null) {
        mentions.push({
          page: page.page,
          label: "mention",
          match: m[0],
          snippet: snippetAround(text, m.index, m[0].length),
        });
        if (mentions.length > 200) return mentions;
      }
    }
  }

  return mentions;
}

function snippetAround(text, index, len, radius = 80) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + len + radius);
  let snip = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) snip = `…${snip}`;
  if (end < text.length) snip = `${snip}…`;
  return snip;
}
