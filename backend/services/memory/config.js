export const MEMORY_CONFIG = {
  maxMemoriesPerUser: Number(process.env.VANI_MEMORY_MAX || 200),
  maxContentLength: 4000,
  maxKeyLength: 160,
  retrieveTopK: Number(process.env.VANI_MEMORY_TOP_K || 8),
  retrieveMinScore: Number(process.env.VANI_MEMORY_MIN_SCORE || 0.42),
  cacheTtlMs: Number(process.env.VANI_MEMORY_CACHE_TTL_MS || 60_000),
  duplicateSimilarity: Number(process.env.VANI_MEMORY_DUP_SIM || 0.92),
  cleanupMinImportance: Number(process.env.VANI_MEMORY_CLEANUP_MIN || 0.15),
  cleanupMaxAgeDays: Number(process.env.VANI_MEMORY_CLEANUP_DAYS || 180),
  temporaryMaxAgeDays: Number(process.env.VANI_MEMORY_TEMPORARY_MAX_DAYS || 7),
  autoExtractMinChars: 40,
  summaryMinMessages: 8,
  cleanupIntervalMs: Number(process.env.VANI_MEMORY_CLEANUP_INTERVAL_MS || 6 * 60 * 60 * 1000),
};

export const CATEGORY_LABELS = {
  profile: "User Profile",
  preference: "Preferences",
  fact: "Long-term Facts",
  project: "Projects",
  goal: "Goals",
  task: "Ongoing Tasks",
  tool: "Tools",
  conversation: "Conversation Memory",
};

/** Default importance by category when not explicitly scored. */
export const CATEGORY_IMPORTANCE = {
  profile: 0.9,
  preference: 0.85,
  goal: 0.8,
  project: 0.75,
  task: 0.7,
  tool: 0.65,
  fact: 0.6,
  conversation: 0.45,
};
