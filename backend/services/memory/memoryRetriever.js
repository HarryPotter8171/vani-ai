import Memory from "../../models/Memory.js";
import { cosineSimilarity, embedQuery } from "../embeddingService.js";
import { cacheGet, cacheSet } from "./cache.js";
import { MEMORY_CONFIG } from "./config.js";
import { decryptContent } from "./encryption.js";
import { isMemoryEnabled, formatMemoriesForPrompt, toPublic } from "./memoryService.js";

/**
 * Semantic (+ importance-weighted) retrieval of memories relevant to a query.
 * Falls back to recent high-importance memories when embeddings fail.
 */
export async function retrieveRelevantMemories(
  userId,
  query,
  {
    topK = MEMORY_CONFIG.retrieveTopK,
    minScore = MEMORY_CONFIG.retrieveMinScore,
    categories,
    chatId = null,
  } = {}
) {
  if (!userId) return [];
  const enabled = await isMemoryEnabled(userId);
  if (!enabled) return [];

  const q = String(query || "").trim();
  const cacheKey = `retrieve:${topK}:${categories?.join(",") || ""}:${q.slice(
    0,
    120
  )}:${chatId ? String(chatId) : ""}`;
  const cached = cacheGet(userId, cacheKey);
  if (cached) return cached;

  const baseFilter = { user: userId };
  if (categories?.length) baseFilter.category = { $in: categories };

  const now = new Date();

  // Build results in priority order: pinned → long_term → temporary.
  const merged = [];
  const seen = new Set();
  const pushUnique = (list = []) => {
    for (const m of list) {
      if (!m?.id || seen.has(m.id)) continue;
      seen.add(m.id);
      merged.push(m);
      if (merged.length >= topK + 4) break;
    }
  };

  // Always include a thin profile/preference spine per-scope so the model knows the user.
  const profileCategories = ["profile", "preference"];

  const semanticForScope = async (scope) => {
    const scopeFilter =
      scope === "long_term"
        ? { ...baseFilter, scope: { $in: ["long_term", null] } }
        : { ...baseFilter, scope };
    if (scope === "temporary") {
      if (!chatId) return [];
      scopeFilter.sourceChatId = chatId;
      // Temporary docs should still have time-to-live, but accept null expiresAt (old docs).
      scopeFilter.$or = [{ expiresAt: null }, { expiresAt: { $gt: now } }];
    }

    if (q.length < 3) return [];

    try {
      const queryVec = await embedQuery(q);
      const candidates = await Memory.find(scopeFilter)
        .select("+embedding")
        .sort({ importance: -1, updatedAt: -1 })
        .limit(120);

      const scored = [];
      for (const doc of candidates) {
        if (!doc.embedding?.length) continue;
        const sim = cosineSimilarity(queryVec, doc.embedding);
        const score = sim * 0.75 + (doc.importance || 0.5) * 0.25;
        if (score >= minScore) {
          scored.push({ doc, score });
        }
      }
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, topK).map((s) => toPublic(s.doc));
    } catch (err) {
      console.warn("[memoryRetriever] semantic retrieve failed:", err.message);
      return [];
    }
  };

  const keywordForScope = async (scope) => {
    const scopeFilter =
      scope === "long_term"
        ? { ...baseFilter, scope: { $in: ["long_term", null] } }
        : { ...baseFilter, scope };
    if (scope === "temporary") {
      if (!chatId) return [];
      scopeFilter.sourceChatId = chatId;
      scopeFilter.$and = scopeFilter.$and || [];
      scopeFilter.$and.push({ $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] });
    }

    const tokens = q
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 5)
      .map((w) => w.toLowerCase());
    if (!tokens.length) return [];

    // Load candidates then match decrypted plaintext — AES ciphertext never
    // satisfies a Mongo regex against the user's query.
    const docs = await Memory.find(scopeFilter)
      .sort({ importance: -1, updatedAt: -1 })
      .limit(Math.min(120, MEMORY_CONFIG.maxMemoriesPerUser));

    const hits = [];
    for (const doc of docs) {
      const keyText = doc.key ? String(doc.key).toLowerCase() : "";
      const text = decryptContent(doc.content, doc.encrypted).toLowerCase();
      if (tokens.some((t) => keyText.includes(t) || text.includes(t))) {
        hits.push(toPublic(doc));
        if (hits.length >= topK) break;
      }
    }
    return hits;
  };

  for (const scope of ["pinned", "long_term", "temporary"]) {
    if (scope === "temporary" && !chatId) continue;

    const profileDocs = await Memory.find({
      user: userId,
      scope:
        scope === "long_term"
          ? { $in: ["long_term", null] }
          : scope,
      category: { $in: profileCategories },
      ...(scope === "temporary" && chatId
        ? { sourceChatId: chatId, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }
        : {}),
    })
      .sort({ importance: -1, updatedAt: -1 })
      .limit(4);

    let semantic = [];
    if (q.length >= 3) {
      semantic = await semanticForScope(scope);
    }
    if (!semantic.length) {
      semantic = await keywordForScope(scope);
    }

    pushUnique([...profileDocs.map(toPublic), ...semantic]);
  }

  cacheSet(userId, cacheKey, merged, MEMORY_CONFIG.cacheTtlMs);
  return merged;
}

/**
 * Build the memory block for the chat system prompt.
 * Designed to be fast: uses cache; never throws.
 */
export async function buildMemoryPromptExtras(userId, query, { chatId = null } = {}) {
  try {
    const memories = await retrieveRelevantMemories(userId, query, { chatId });
    return {
      extras: formatMemoriesForPrompt(memories),
      memories,
    };
  } catch (err) {
    console.warn("[memoryRetriever] prompt extras failed:", err.message);
    return { extras: "", memories: [] };
  }
}

/**
 * Decrypt helper for callers that loaded raw docs with select('+embedding').
 */
export function publicFromLean(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    userId: String(doc.user),
    category: doc.category,
    content: decryptContent(doc.content, !!doc.encrypted),
    key: doc.key || null,
    importance: doc.importance,
    source: doc.source,
    chatId: doc.chatId ? String(doc.chatId) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
