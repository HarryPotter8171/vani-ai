import Memory from "../../models/Memory.js";
import { MEMORY_CONFIG } from "./config.js";
import { cacheInvalidateUser } from "./cache.js";

/**
 * Remove stale low-importance memories (background hygiene).
 * Protects profile/preference categories and high-importance facts.
 */
export async function cleanupStaleMemories({ dryRun = false } = {}) {
  const now = new Date();
  const cutoff = new Date(
    Date.now() - MEMORY_CONFIG.cleanupMaxAgeDays * 24 * 60 * 60 * 1000
  );
  const temporaryCutoff = new Date(
    Date.now() - MEMORY_CONFIG.temporaryMaxAgeDays * 24 * 60 * 60 * 1000
  );

  // 1) Temporary memories: drop when expiresAt has passed, or when they are
  // past the temporary age window with no usable expiry (legacy null expiresAt).
  const temporaryFilter = {
    scope: "temporary",
    $or: [
      { expiresAt: { $lt: now } },
      {
        $and: [
          { $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }] },
          { updatedAt: { $lt: temporaryCutoff } },
        ],
      },
    ],
  };

  // 2) Low-importance auto/summary memories: prune when stale.
  const filter = {
    scope: "long_term",
    importance: { $lt: MEMORY_CONFIG.cleanupMinImportance },
    updatedAt: { $lt: cutoff },
    category: { $nin: ["profile", "preference"] },
    source: { $in: ["auto", "summary"] },
  };

  // 3) Unused low-importance long-term: can be archived after ~1 year (best-effort).
  const oneYear = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const unusedLowImportanceFilter = {
    scope: "long_term",
    importance: { $lt: MEMORY_CONFIG.cleanupMinImportance },
    updatedAt: { $lt: oneYear },
    category: { $nin: ["profile", "preference"] },
  };

  if (dryRun) {
    const [tCount, count, uCount] = await Promise.all([
      Memory.countDocuments(temporaryFilter),
      Memory.countDocuments(filter),
      Memory.countDocuments(unusedLowImportanceFilter),
    ]);
    return { deleted: 0, wouldDelete: tCount + count + uCount, dryRun: true };
  }

  // Collect affected users for cache invalidation
  const affected = await Memory.find({ $or: [temporaryFilter, filter, unusedLowImportanceFilter] })
    .select("user")
    .limit(5000)
    .lean();
  const userIds = [...new Set(affected.map((d) => String(d.user)))];

  const [tRes, result, uRes] = await Promise.all([
    Memory.deleteMany(temporaryFilter),
    Memory.deleteMany(filter),
    Memory.deleteMany(unusedLowImportanceFilter),
  ]);

  for (const uid of userIds) cacheInvalidateUser(uid);

  return {
    deleted: (tRes.deletedCount || 0) + (result.deletedCount || 0) + (uRes.deletedCount || 0),
    usersTouched: userIds.length,
  };
}

/**
 * Cap per-user memory count by dropping oldest low-importance autos.
 */
export async function enforceUserCap(userId) {
  const count = await Memory.countDocuments({ user: userId });
  if (count <= MEMORY_CONFIG.maxMemoriesPerUser) {
    return { deleted: 0 };
  }

  const overflow = count - MEMORY_CONFIG.maxMemoriesPerUser;
  const victims = await Memory.find({
    user: userId,
    scope: "long_term",
    category: { $nin: ["profile", "preference"] },
  })
    .sort({ importance: 1, updatedAt: 1 })
    .limit(overflow)
    .select("_id");

  if (!victims.length) return { deleted: 0 };
  const result = await Memory.deleteMany({
    _id: { $in: victims.map((v) => v._id) },
    user: userId,
  });
  cacheInvalidateUser(userId);
  return { deleted: result.deletedCount || 0 };
}

let cleanupTimer = null;

/** Start periodic cleanup (idempotent). */
export function startMemoryCleanupScheduler() {
  if (cleanupTimer) return;
  const run = () => {
    cleanupStaleMemories().catch((err) =>
      console.warn("[memoryCleanup] failed:", err.message)
    );
  };
  // Delay first run so boot isn't blocked.
  const kickoff = setTimeout(run, 90_000);
  if (typeof kickoff.unref === "function") kickoff.unref();

  cleanupTimer = setInterval(run, MEMORY_CONFIG.cleanupIntervalMs);
  if (typeof cleanupTimer.unref === "function") cleanupTimer.unref();
}

/** Stop the periodic cleanup timer (graceful shutdown). */
export function stopMemoryCleanupScheduler() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
