/**
 * Mongo persistence for browser site permissions.
 * Memory is always the L1 cache so approvals work before Mongo connects.
 */

import BrowserPermission from "../models/BrowserPermission.js";

function isMongoReady() {
  try {
    return BrowserPermission.db?.readyState === 1;
  } catch {
    return false;
  }
}

class MemoryStore {
  constructor() {
    this.map = new Map();
  }

  key(userId, origin) {
    return `${userId}::${origin}`;
  }

  async get(userId, origin) {
    return this.map.get(this.key(userId, origin)) || null;
  }

  async set(record) {
    const next = { ...record, updatedAt: new Date().toISOString() };
    this.map.set(this.key(record.userId, record.origin), next);
    return next;
  }

  async list(userId) {
    return [...this.map.values()].filter((r) => r.userId === userId);
  }

  async remove(userId, origin) {
    return this.map.delete(this.key(userId, origin));
  }
}

export function createMongoBrowserPermissionStore() {
  const memory = new MemoryStore();

  return {
    async get(userId, origin) {
      const cached = await memory.get(userId, origin);
      if (cached) return cached;
      if (!isMongoReady()) return null;
      try {
        const doc = await BrowserPermission.findOne({
          user: userId,
          origin,
        }).lean();
        if (!doc) return null;
        const record = {
          userId: String(doc.user),
          origin: doc.origin,
          alwaysAllow: Boolean(doc.alwaysAllow),
          alwaysDeny: Boolean(doc.alwaysDeny),
          updatedAt: doc.updatedAt?.toISOString?.(),
        };
        await memory.set(record);
        return record;
      } catch {
        return null;
      }
    },

    async set(record) {
      const next = await memory.set(record);
      if (!isMongoReady()) return next;
      try {
        const doc = await BrowserPermission.findOneAndUpdate(
          { user: record.userId, origin: record.origin },
          {
            $set: {
              alwaysAllow: Boolean(record.alwaysAllow),
              alwaysDeny: Boolean(record.alwaysDeny),
            },
          },
          { upsert: true, new: true, runValidators: true }
        );
        return {
          userId: String(doc.user),
          origin: doc.origin,
          alwaysAllow: Boolean(doc.alwaysAllow),
          alwaysDeny: Boolean(doc.alwaysDeny),
          updatedAt: doc.updatedAt?.toISOString?.(),
        };
      } catch {
        return next;
      }
    },

    async list(userId) {
      if (!isMongoReady()) return memory.list(userId);
      try {
        const docs = await BrowserPermission.find({ user: userId })
          .sort({ updatedAt: -1 })
          .lean();
        const records = docs.map((doc) => ({
          userId: String(doc.user),
          origin: doc.origin,
          alwaysAllow: Boolean(doc.alwaysAllow),
          alwaysDeny: Boolean(doc.alwaysDeny),
          updatedAt: doc.updatedAt?.toISOString?.(),
        }));
        for (const record of records) {
          await memory.set(record);
        }
        return records;
      } catch {
        return memory.list(userId);
      }
    },

    async remove(userId, origin) {
      await memory.remove(userId, origin);
      if (!isMongoReady()) return true;
      try {
        const res = await BrowserPermission.deleteOne({ user: userId, origin });
        return res.deletedCount > 0;
      } catch {
        return true;
      }
    },
  };
}
