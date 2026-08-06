import { MEMORY_CATEGORIES, MEMORY_SCOPES, MEMORY_SOURCES } from "../../models/Memory.js";
import { CATEGORY_IMPORTANCE, MEMORY_CONFIG } from "./config.js";

export function normalizeKey(key) {
  if (key == null || key === "") return null;
  const normalized = String(key).trim().toLowerCase().slice(0, MEMORY_CONFIG.maxKeyLength);
  return normalized || null;
}

export function normalizeContent(content) {
  return String(content || "").trim().slice(0, MEMORY_CONFIG.maxContentLength);
}

export function normalizeCategory(category) {
  const c = String(category || "fact").trim().toLowerCase();
  return MEMORY_CATEGORIES.includes(c) ? c : "fact";
}

export function normalizeSource(source) {
  const s = String(source || "manual").trim().toLowerCase();
  return MEMORY_SOURCES.includes(s) ? s : "manual";
}

export function normalizeScope(scope) {
  const s = String(scope || "long_term").trim();
  const normalized = s === "long_term" || s === "temporary" || s === "pinned" ? s : "long_term";
  return normalized;
}

export function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((t) => String(t || "").trim())
    .filter(Boolean)
    .slice(0, 30);
}

export function clampImportance(value, category) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(1, Math.max(0, value));
  }
  return CATEGORY_IMPORTANCE[category] ?? 0.5;
}

/**
 * Heuristic importance from content signals (length, explicit prefs, goals).
 */
export function scoreImportance({ content, category, source } = {}) {
  let score = CATEGORY_IMPORTANCE[category] ?? 0.5;
  const text = String(content || "").toLowerCase();

  if (source === "manual" || source === "tool") score += 0.08;
  if (/\b(always|never|prefer|please remember|my name is)\b/.test(text)) score += 0.1;
  if (/\b(goal|deadline|shipping|launch)\b/.test(text)) score += 0.05;
  if (text.length < 20) score -= 0.1;
  if (text.length > 200) score += 0.03;

  return Math.min(1, Math.max(0.05, Number(score.toFixed(3))));
}

export function validateMemoryInput({ content, key, category, scope, confidence, tags } = {}) {
  const normalizedContent = normalizeContent(content);
  if (!normalizedContent) {
    return { ok: false, error: "Memory content is required" };
  }
  if (normalizedContent.length > MEMORY_CONFIG.maxContentLength) {
    return { ok: false, error: `Memory content exceeds ${MEMORY_CONFIG.maxContentLength} characters` };
  }
  const normalizedKey = normalizeKey(key);
  const normalizedCategory = normalizeCategory(category);

  const normalizedScope = scope ? normalizeScope(scope) : "long_term";
  const normalizedConfidence =
    typeof confidence === "number" && Number.isFinite(confidence)
      ? Math.min(1, Math.max(0, confidence))
      : undefined;

  return {
    ok: true,
    content: normalizedContent,
    key: normalizedKey,
    category: normalizedCategory,
    scope: normalizedScope,
    confidence: normalizedConfidence,
    tags: normalizeTags(tags),
  };
}

/** Escape user search for safe RegExp. */
export function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
