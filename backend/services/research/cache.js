/**
 * In-memory TTL cache for search results and fetched page extracts.
 * Single-process safe; swap for Redis when scaling horizontally.
 */

export class TtlCache {
  /**
   * @param {{ ttlMs?: number, maxEntries?: number }} [options]
   */
  constructor({ ttlMs = 30 * 60 * 1000, maxEntries = 500 } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    /** @type {Map<string, { value: unknown, expiresAt: number }>} */
    this._store = new Map();
  }

  _sweep() {
    const now = Date.now();
    for (const [key, entry] of this._store) {
      if (entry.expiresAt <= now) this._store.delete(key);
    }
    while (this._store.size > this.maxEntries) {
      const oldest = this._store.keys().next().value;
      if (oldest === undefined) break;
      this._store.delete(oldest);
    }
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this._store.delete(key);
      return undefined;
    }
    // Refresh insertion order for approximate LRU eviction.
    this._store.delete(key);
    this._store.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlMs = this.ttlMs) {
    this._sweep();
    this._store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    this._store.delete(key);
  }

  clear() {
    this._store.clear();
  }
}

export const searchCache = new TtlCache({ ttlMs: 30 * 60 * 1000, maxEntries: 200 });
export const pageCache = new TtlCache({ ttlMs: 60 * 60 * 1000, maxEntries: 300 });
