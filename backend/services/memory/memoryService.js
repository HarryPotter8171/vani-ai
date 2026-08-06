import Memory, { MEMORY_CATEGORIES } from "../../models/Memory.js";
import User from "../../models/User.js";
import { cosineSimilarity, embedTexts } from "../embeddingService.js";
import { cacheGet, cacheInvalidateUser, cacheSet } from "./cache.js";
import { MEMORY_CONFIG } from "./config.js";
import { decryptContent, encryptContent } from "./encryption.js";
import {
  clampImportance,
  escapeRegex,
  normalizeCategory,
  normalizeContent,
  normalizeKey,
  normalizeSource,
  normalizeScope,
  scoreImportance,
  validateMemoryInput,
} from "./validate.js";

function defaultTemporaryExpiry(from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + MEMORY_CONFIG.temporaryMaxAgeDays);
  return d;
}

function resolveExpiresAt(scope, inputExpiresAt) {
  if (scope !== "temporary") return null;
  if (inputExpiresAt) {
    const d =
      inputExpiresAt instanceof Date ? inputExpiresAt : new Date(inputExpiresAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return defaultTemporaryExpiry();
}

function toPublic(doc) {
  if (!doc) return null;
  const raw = doc.toObject ? doc.toObject() : doc;
  const rawContent = raw.content || raw.value || "";
  const content = decryptContent(rawContent, !!raw.encrypted);
  return {
    id: String(raw._id),
    userId: String(raw.user),
    category: raw.category || "fact",
    content,
    // Spec-aligned alias (repo historically uses `content`).
    value: content,
    key: raw.key || null,
    importance: raw.importance ?? 0.5,
    scope: raw.scope || "long_term",
    expiresAt: raw.expiresAt || null,
    confidence: raw.confidence ?? 0.5,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    source: raw.source || "manual",
    chatId: raw.chatId ? String(raw.chatId) : null,
    sourceChatId: raw.sourceChatId ? String(raw.sourceChatId) : raw.chatId ? String(raw.chatId) : null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    metadata: raw.metadata || undefined,
  };
}

async function embedSafe(text) {
  try {
    const [vector] = await embedTexts([text]);
    return vector || null;
  } catch (err) {
    console.warn("[memory] embedding failed:", err.message);
    return null;
  }
}

async function assertUnderCap(userId, excludeId = null) {
  const filter = { user: userId };
  if (excludeId) filter._id = { $ne: excludeId };
  const count = await Memory.countDocuments(filter);
  if (count >= MEMORY_CONFIG.maxMemoriesPerUser) {
    throw new Error(`Memory limit reached (${MEMORY_CONFIG.maxMemoriesPerUser})`);
  }
}

/**
 * Find a near-duplicate by key or embedding similarity.
 */
async function findDuplicate(userId, { key, content, embedding }) {
  if (key) {
    const byKey = await Memory.findOne({ user: userId, key }).select(
      "+embedding content key category importance encrypted scope expiresAt confidence tags chatId sourceChatId"
    );
    if (byKey) return byKey;
  }

  if (!embedding?.length) return null;

  const candidates = await Memory.find({ user: userId })
    .select("+embedding content key category importance encrypted scope expiresAt confidence tags chatId sourceChatId")
    .sort({ updatedAt: -1 })
    .limit(80)
    .lean();

  let best = null;
  let bestScore = 0;
  for (const cand of candidates) {
    if (!cand.embedding?.length) continue;
    const score = cosineSimilarity(embedding, cand.embedding);
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  if (best && bestScore >= MEMORY_CONFIG.duplicateSimilarity) return best;
  return null;
}

export async function isMemoryEnabled(userId) {
  const cached = cacheGet(userId, "enabled");
  if (typeof cached === "boolean") return cached;
  const user = await User.findById(userId).select("memoryEnabled").lean();
  const enabled = user?.memoryEnabled !== false;
  cacheSet(userId, "enabled", enabled, MEMORY_CONFIG.cacheTtlMs);
  return enabled;
}

export async function getMemorySettings(userId) {
  const user = await User.findById(userId)
    .select("memoryEnabled profile preferences name email")
    .lean();
  if (!user) throw new Error("User not found");
  return {
    enabled: user.memoryEnabled !== false,
    profile: {
      preferredName: user.profile?.preferredName || user.name || "",
      preferredLanguage: user.profile?.preferredLanguage || "",
      timezone: user.profile?.timezone || "",
      profession: user.profile?.profession || "",
      interests: user.profile?.interests || [],
    },
    preferences: {
      responseStyle: user.preferences?.responseStyle || "",
      codingStyle: user.preferences?.codingStyle || "",
      favoriteModel: user.preferences?.favoriteModel || "",
      uiPreferences: user.preferences?.uiPreferences || "",
    },
  };
}

export async function updateMemorySettings(userId, patch = {}) {
  const update = {};
  if (typeof patch.enabled === "boolean") {
    update.memoryEnabled = patch.enabled;
  }
  if (patch.profile && typeof patch.profile === "object") {
    for (const field of [
      "preferredName",
      "preferredLanguage",
      "timezone",
      "profession",
    ]) {
      if (typeof patch.profile[field] === "string") {
        update[`profile.${field}`] = patch.profile[field].trim().slice(0, 160);
      }
    }
    if (Array.isArray(patch.profile.interests)) {
      update["profile.interests"] = patch.profile.interests
        .map((i) => String(i).trim())
        .filter(Boolean)
        .slice(0, 20);
    }
    // preferredName lives only under profile — never overwrite authenticated user.name
  }
  if (patch.preferences && typeof patch.preferences === "object") {
    for (const field of [
      "responseStyle",
      "codingStyle",
      "favoriteModel",
      "uiPreferences",
    ]) {
      if (typeof patch.preferences[field] === "string") {
        update[`preferences.${field}`] = patch.preferences[field].trim().slice(0, 400);
      }
    }
  }
  if (!Object.keys(update).length) throw new Error("No valid settings to update");

  await User.findByIdAndUpdate(userId, { $set: update }, { new: true });
  cacheInvalidateUser(userId);

  // Mirror structured profile/preferences into searchable memory rows (best-effort).
  if (patch.profile || patch.preferences) {
    try {
      const settings = await getMemorySettings(userId);
      const pairs = [
        ["preferred_name", settings.profile.preferredName, "profile"],
        ["preferred_language", settings.profile.preferredLanguage, "profile"],
        ["timezone", settings.profile.timezone, "profile"],
        ["profession", settings.profile.profession, "profile"],
        ["interests", (settings.profile.interests || []).join(", "), "profile"],
        ["response_style", settings.preferences.responseStyle, "preference"],
        ["coding_style", settings.preferences.codingStyle, "preference"],
        ["favorite_model", settings.preferences.favoriteModel, "preference"],
        ["ui_preferences", settings.preferences.uiPreferences, "preference"],
      ];
      for (const [key, value, category] of pairs) {
        if (!value || !String(value).trim()) continue;
        await createMemory(userId, {
          key,
          content: String(value).trim(),
          category,
          source: "manual",
          importance: category === "profile" ? 0.92 : 0.85,
        });
      }
    } catch (err) {
      console.warn("[memory] profile mirror skipped:", err.message);
    }
  }

  return getMemorySettings(userId);
}

/**
 * Create or upsert a memory. Deduplicates by key / semantic similarity.
 */
export async function createMemory(userId, input = {}) {
  if (!userId) throw new Error("User required for memory");

  const enabled = await isMemoryEnabled(userId);
  if (!enabled) {
    const err = new Error("Memory is disabled. Enable it in Settings to save memories.");
    err.code = "MEMORY_DISABLED";
    err.status = 403;
    throw err;
  }

  const validated = validateMemoryInput(input);
  if (!validated.ok) throw new Error(validated.error);

  const category = validated.category;
  const source = normalizeSource(input.source);
  const importance = clampImportance(
    input.importance ?? scoreImportance({ content: validated.content, category, source }),
    category
  );
  const scope = validated.scope || normalizeScope(input.scope);
  const confidence = validated.confidence ?? 0.5;
  const tags = validated.tags || [];
  const chatId = input.chatId || null;
  const sourceChatId = input.sourceChatId || chatId || null;
  const expiresAt = resolveExpiresAt(scope, input.expiresAt);
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : undefined;

  const embedding = await embedSafe(validated.content);
  const duplicate = await findDuplicate(userId, {
    key: validated.key,
    content: validated.content,
    embedding,
  });

  const packed = encryptContent(validated.content);

  if (duplicate) {
    const mergedImportance = Math.max(duplicate.importance || 0, importance);
    // Pinned > long_term > temporary.
    const precedence = { pinned: 3, long_term: 2, temporary: 1 };
    const duplicateScope = duplicate.scope || "long_term";
    const mergedScope =
      precedence[duplicateScope] >= precedence[scope] ? duplicateScope : scope;

    const mergedExpiresAt =
      mergedScope === "temporary"
        ? resolveExpiresAt("temporary", expiresAt || duplicate.expiresAt || null)
        : null;

    const doc = await Memory.findOneAndUpdate(
      { _id: duplicate._id, user: userId },
      {
        content: packed.content,
        encrypted: packed.encrypted,
        category,
        importance: mergedImportance,
        source,
        scope: mergedScope,
        confidence: Math.max(duplicate.confidence || 0, confidence),
        tags: Array.isArray(tags) && tags.length ? tags : duplicate.tags,
        expiresAt: mergedExpiresAt,
        ...(validated.key ? { key: validated.key } : {}),
        ...(embedding ? { embedding } : {}),
        ...(chatId ? { chatId } : {}),
        ...(sourceChatId ? { sourceChatId } : {}),
        ...(metadata ? { metadata } : {}),
      },
      { new: true }
    );
    cacheInvalidateUser(userId);
    return { memory: toPublic(doc), deduplicated: true };
  }

  await assertUnderCap(userId);

  const doc = await Memory.create({
    user: userId,
    category,
    content: packed.content,
    encrypted: packed.encrypted,
    key: validated.key,
    importance,
    embedding: embedding || undefined,
    source,
    chatId,
    sourceChatId,
    expiresAt,
    scope,
    confidence,
    tags,
    metadata,
  });

  cacheInvalidateUser(userId);
  return { memory: toPublic(doc), deduplicated: false };
}

/** Tool-compatible save(key, value). */
export async function saveMemory(userId, key, value, extras = {}) {
  const normalizedKey = normalizeKey(key);
  const normalizedValue = normalizeContent(value);
  if (!normalizedKey || !normalizedValue) {
    throw new Error("Memory key and value are required");
  }
  const category = normalizeCategory(extras.category || inferCategoryFromKey(normalizedKey));
  const result = await createMemory(userId, {
    key: normalizedKey,
    content: normalizedValue,
    category,
    source: extras.source || "tool",
    importance: extras.importance,
    chatId: extras.chatId,
    sourceChatId: extras.sourceChatId || extras.chatId,
    scope: extras.scope,
    expiresAt: extras.expiresAt,
    confidence: extras.confidence,
    tags: extras.tags,
    metadata: extras.metadata,
  });
  return {
    key: result.memory.key,
    value: result.memory.content,
    category: result.memory.category,
    updatedAt: result.memory.updatedAt,
    id: result.memory.id,
    deduplicated: result.deduplicated,
  };
}

function inferCategoryFromKey(key) {
  if (/name|language|timezone|profession|interest/.test(key)) return "profile";
  if (/style|prefer|model|ui_|theme|tone/.test(key)) return "preference";
  if (/goal|ambition/.test(key)) return "goal";
  if (/project|repo|codebase/.test(key)) return "project";
  if (/task|todo|wip/.test(key)) return "task";
  if (/tool|stack|framework/.test(key)) return "tool";
  return "fact";
}

export async function recallMemory(userId, key) {
  if (!userId) throw new Error("User required for memory");
  const normalizedKey = normalizeKey(key);
  const doc = await Memory.findOne({ user: userId, key: normalizedKey });
  if (!doc) return null;
  const pub = toPublic(doc);
  return {
    key: pub.key,
    value: pub.content,
    updatedAt: pub.updatedAt,
    id: pub.id,
    scope: pub.scope,
    expiresAt: pub.expiresAt,
    confidence: pub.confidence,
    tags: pub.tags,
    sourceChatId: pub.sourceChatId,
  };
}

export async function listMemories(
  userId,
  { limit = 50, offset = 0, category, q, sort = "updatedAt" } = {}
) {
  if (!userId) throw new Error("User required for memory");

  const cacheKey = `list:${limit}:${offset}:${category || ""}:${q || ""}:${sort}`;
  const cached = cacheGet(userId, cacheKey);
  if (cached) return cached;

  const filter = { user: userId };
  if (category && MEMORY_CATEGORIES.includes(category)) {
    filter.category = category;
  }

  const sortSpec =
    sort === "importance"
      ? { importance: -1, updatedAt: -1 }
      : sort === "createdAt"
        ? { createdAt: -1 }
        : { updatedAt: -1 };

  const safeLimit = Math.min(Math.max(1, Number(limit) || 50), MEMORY_CONFIG.maxMemoriesPerUser);
  const safeOffset = Math.max(0, Number(offset) || 0);
  const qTrim = q?.trim() || "";

  // Encrypted content is ciphertext in Mongo — search after decrypt so AES
  // docs remain findable. Cap is bounded (MEMORY_MAX), so full-user scan is OK.
  if (qTrim) {
    const needle = qTrim.toLowerCase();
    const docs = await Memory.find(filter).sort(sortSpec).limit(MEMORY_CONFIG.maxMemoriesPerUser);
    const matched = [];
    for (const doc of docs) {
      const keyHit = doc.key && String(doc.key).toLowerCase().includes(needle);
      const text = decryptContent(doc.content, doc.encrypted);
      if (keyHit || text.toLowerCase().includes(needle)) {
        matched.push(doc);
      }
    }
    const page = matched.slice(safeOffset, safeOffset + safeLimit);
    const result = {
      memories: page.map(toPublic),
      total: matched.length,
      limit: safeLimit,
      offset: safeOffset,
    };
    cacheSet(userId, cacheKey, result);
    return result;
  }

  const [docs, total] = await Promise.all([
    Memory.find(filter).sort(sortSpec).skip(safeOffset).limit(safeLimit),
    Memory.countDocuments(filter),
  ]);

  const result = {
    memories: docs.map(toPublic),
    total,
    limit: safeLimit,
    offset: safeOffset,
  };
  cacheSet(userId, cacheKey, result);
  return result;
}

export async function getMemoryById(userId, memoryId) {
  const doc = await Memory.findOne({ _id: memoryId, user: userId });
  if (!doc) return null;
  return toPublic(doc);
}

export async function updateMemory(userId, memoryId, patch = {}) {
  if (!userId) throw new Error("User required for memory");
  const doc = await Memory.findOne({ _id: memoryId, user: userId });
  if (!doc) throw new Error("Memory not found");

  const nextContent =
    typeof patch.content === "string" ? normalizeContent(patch.content) : decryptContent(doc.content, doc.encrypted);
  if (!nextContent) throw new Error("Memory content is required");

  if (typeof patch.category === "string") {
    doc.category = normalizeCategory(patch.category);
  }
  if (typeof patch.key === "string") {
    doc.key = normalizeKey(patch.key);
  } else if (patch.key === null) {
    doc.key = null;
  }
  if (typeof patch.scope === "string") {
    doc.scope = normalizeScope(patch.scope);
    if (doc.scope !== "temporary") {
      doc.expiresAt = null;
    } else if (patch.expiresAt === undefined) {
      doc.expiresAt = resolveExpiresAt("temporary", doc.expiresAt);
    }
  }
  if (typeof patch.confidence === "number" && Number.isFinite(patch.confidence)) {
    doc.confidence = Math.min(1, Math.max(0, patch.confidence));
  }
  if (Array.isArray(patch.tags)) {
    doc.tags = patch.tags.map((t) => String(t || "").trim()).filter(Boolean).slice(0, 30);
  }
  if (patch.expiresAt !== undefined) {
    doc.expiresAt = resolveExpiresAt(doc.scope, patch.expiresAt);
  } else if (doc.scope === "temporary" && !doc.expiresAt) {
    doc.expiresAt = defaultTemporaryExpiry();
  }
  if (typeof patch.importance === "number") {
    doc.importance = clampImportance(patch.importance, doc.category);
  }

  if (typeof patch.content === "string") {
    const packed = encryptContent(nextContent);
    doc.content = packed.content;
    doc.encrypted = packed.encrypted;
    const embedding = await embedSafe(nextContent);
    if (embedding) doc.embedding = embedding;
    if (patch.importance == null) {
      doc.importance = scoreImportance({
        content: nextContent,
        category: doc.category,
        source: doc.source,
      });
    }
  }

  await doc.save();
  cacheInvalidateUser(userId);
  return toPublic(doc);
}

/**
 * Update scope without touching content/category/embeddings.
 */
export async function updateMemoryScope(userId, memoryId, scope, { expiresAt = null } = {}) {
  if (!userId) throw new Error("User required for memory");
  const doc = await Memory.findOne({ _id: memoryId, user: userId });
  if (!doc) throw new Error("Memory not found");
  doc.scope = normalizeScope(scope);
  doc.expiresAt = resolveExpiresAt(doc.scope, expiresAt || doc.expiresAt);
  await doc.save();
  cacheInvalidateUser(userId);
  return toPublic(doc);
}

export async function deleteMemory(userId, keyOrId) {
  if (!userId) throw new Error("User required for memory");
  const value = String(keyOrId || "").trim();
  if (!value) return { deleted: false };

  // Prefer ObjectId delete when it looks like one.
  let result;
  if (/^[a-fA-F0-9]{24}$/.test(value)) {
    result = await Memory.deleteOne({ _id: value, user: userId });
    if (result.deletedCount > 0) {
      cacheInvalidateUser(userId);
      return { deleted: true, id: value };
    }
  }

  const key = normalizeKey(value);
  result = await Memory.deleteOne({ user: userId, key });
  cacheInvalidateUser(userId);
  return { deleted: result.deletedCount > 0, key };
}

export async function deleteMemoryById(userId, memoryId) {
  const result = await Memory.deleteOne({ _id: memoryId, user: userId });
  cacheInvalidateUser(userId);
  return { deleted: result.deletedCount > 0, id: String(memoryId) };
}

/**
 * "Forget this" — delete by id, or fuzzy-match content from a chat snippet.
 */
export async function forgetMemory(userId, { memoryId, content, chatId } = {}) {
  if (!userId) throw new Error("User required for memory");

  if (memoryId) {
    return deleteMemoryById(userId, memoryId);
  }

  const snippet = normalizeContent(content);
  if (!snippet) throw new Error("Provide memoryId or content to forget");

  const filter = { user: userId };
  if (chatId) filter.chatId = chatId;

  // Exact / contains match first (works even when embeddings unavailable).
  const rx = new RegExp(escapeRegex(snippet.slice(0, 200)), "i");
  const matches = await Memory.find({
    ...filter,
    $or: [{ content: rx }, { key: rx }],
  }).limit(20);

  // Decrypt filter for encrypted docs — never treat "any regex hit" as a match.
  const needle = snippet.toLowerCase().slice(0, 80);
  const decryptedMatches = [];
  for (const m of matches) {
    const text = decryptContent(m.content, m.encrypted);
    const keyText = m.key ? String(m.key).toLowerCase() : "";
    if (
      text.toLowerCase().includes(needle) ||
      (keyText && keyText.includes(needle))
    ) {
      decryptedMatches.push(m);
    }
  }

  if (!decryptedMatches.length) {
    // Semantic forget: retrieve closest and delete if similar enough
    const embedding = await embedSafe(snippet);
    if (embedding) {
      const candidates = await Memory.find({ user: userId })
        .select("+embedding")
        .limit(100)
        .lean();
      let best = null;
      let bestScore = 0;
      for (const c of candidates) {
        if (!c.embedding?.length) continue;
        const score = cosineSimilarity(embedding, c.embedding);
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      if (best && bestScore >= 0.78) {
        await Memory.deleteOne({ _id: best._id, user: userId });
        cacheInvalidateUser(userId);
        return { deleted: true, id: String(best._id), score: bestScore };
      }
    }
    return { deleted: false };
  }

  const ids = decryptedMatches.map((m) => m._id);
  const result = await Memory.deleteMany({ _id: { $in: ids }, user: userId });
  cacheInvalidateUser(userId);
  return { deleted: result.deletedCount > 0, count: result.deletedCount };
}

export async function deleteAllMemories(userId) {
  const result = await Memory.deleteMany({ user: userId });
  cacheInvalidateUser(userId);
  return { deleted: result.deletedCount };
}

export async function exportMemories(userId) {
  const { memories } = await listMemories(userId, { limit: MEMORY_CONFIG.maxMemoriesPerUser });
  const settings = await getMemorySettings(userId);
  return {
    exportedAt: new Date().toISOString(),
    settings,
    memories: memories.map((m) => ({
      id: m.id,
      category: m.category,
      content: m.content,
      key: m.key,
      importance: m.importance,
      scope: m.scope,
      expiresAt: m.expiresAt,
      confidence: m.confidence,
      tags: m.tags,
      sourceChatId: m.sourceChatId,
      source: m.source,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    })),
  };
}

/**
 * Format memories for the system prompt (non-blocking callers should already
 * have retrieved a small set).
 */
export function formatMemoriesForPrompt(memories = []) {
  if (!memories?.length) return "";
  const lines = memories.map((m) => {
    const label = m.category ? `[${m.category}]` : "[fact]";
    const keyBit = m.key ? ` ${m.key}:` : "";
    return `- ${label}${keyBit} ${m.content}`;
  });
  return (
    "LONG-TERM MEMORY (private user facts — use when relevant, never invent, " +
    "never recite the full list unprompted):\n" +
    lines.join("\n")
  );
}

export { MEMORY_CATEGORIES, MEMORY_CONFIG, toPublic };
