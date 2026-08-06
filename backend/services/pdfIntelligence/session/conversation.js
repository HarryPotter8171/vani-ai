import { PDF_CONVERSATION_MAX_TURNS, PDF_CONVERSATION_TTL_MS } from "../config.js";

/**
 * In-memory conversation store for PDF follow-up Q&A.
 * Keyed by `${fileId}:${sessionId}`. Soft TTL eviction.
 */
const store = new Map();

function keyFor(fileId, sessionId) {
  return `${fileId}:${sessionId}`;
}

function pruneExpired() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.updatedAt > PDF_CONVERSATION_TTL_MS) {
      store.delete(key);
    }
  }
}

export function getConversation(fileId, sessionId) {
  if (!fileId || !sessionId) return [];
  pruneExpired();
  const entry = store.get(keyFor(fileId, sessionId));
  return entry ? [...entry.turns] : [];
}

export function appendTurn(fileId, sessionId, turn) {
  if (!fileId || !sessionId) return;
  pruneExpired();
  const key = keyFor(fileId, sessionId);
  const entry = store.get(key) || { turns: [], updatedAt: Date.now() };
  entry.turns.push({
    role: turn.role,
    content: String(turn.content || "").slice(0, 4000),
    citations: turn.citations || undefined,
    at: new Date().toISOString(),
  });
  if (entry.turns.length > PDF_CONVERSATION_MAX_TURNS * 2) {
    entry.turns = entry.turns.slice(-PDF_CONVERSATION_MAX_TURNS * 2);
  }
  entry.updatedAt = Date.now();
  store.set(key, entry);
}

export function clearConversation(fileId, sessionId) {
  if (!fileId || !sessionId) return;
  store.delete(keyFor(fileId, sessionId));
}

/** Test helper */
export function _resetConversations() {
  store.clear();
}
