/**
 * Client-only memory UX prefs (pin / temporary mirrors).
 * Server `scope` is authoritative; local prefs keep multi-device UX snappy.
 */

const STORAGE_KEY = 'vani-memory-prefs';

export interface MemoryPrefs {
  /** Memory ids the user pinned in the UI */
  pinnedIds: string[];
  /** Temporary memories: id → ISO expiry */
  temporary: Record<string, string>;
}

const EMPTY: MemoryPrefs = { pinnedIds: [], temporary: {} };

function read(): MemoryPrefs {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<MemoryPrefs>;
    return {
      pinnedIds: Array.isArray(parsed.pinnedIds) ? parsed.pinnedIds.filter(Boolean) : [],
      temporary:
        parsed.temporary && typeof parsed.temporary === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.temporary).filter(
                ([, v]) => typeof v === 'string'
              )
            )
          : {},
    };
  } catch {
    return EMPTY;
  }
}

function write(prefs: MemoryPrefs) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* quota / private mode */
  }
}

export function getMemoryPrefs(): MemoryPrefs {
  return read();
}

export function isMemoryPinned(id: string, prefs = read()): boolean {
  return prefs.pinnedIds.includes(id);
}

export function isMemoryTemporary(id: string, prefs = read()): boolean {
  const exp = prefs.temporary[id];
  if (!exp) return false;
  const t = Date.parse(exp);
  if (Number.isNaN(t)) return false;
  if (t <= Date.now()) return false;
  return true;
}

export function getTemporaryExpiry(id: string, prefs = read()): string | null {
  if (!isMemoryTemporary(id, prefs)) return null;
  return prefs.temporary[id] || null;
}

/** Remove expired temporary entries. Returns cleaned prefs. */
export function pruneExpiredTemporary(prefs = read()): MemoryPrefs {
  const now = Date.now();
  let changed = false;
  const next: Record<string, string> = {};
  for (const [id, exp] of Object.entries(prefs.temporary)) {
    const t = Date.parse(exp);
    if (!Number.isNaN(t) && t > now) next[id] = exp;
    else changed = true;
  }
  const cleaned = changed ? { ...prefs, temporary: next } : prefs;
  if (changed) write(cleaned);
  return cleaned;
}

export function toggleMemoryPinned(id: string): MemoryPrefs {
  const prefs = pruneExpiredTemporary();
  const pinned = new Set(prefs.pinnedIds);
  if (pinned.has(id)) pinned.delete(id);
  else pinned.add(id);
  const next = { ...prefs, pinnedIds: Array.from(pinned) };
  write(next);
  return next;
}

/** Mark temporary for `days` (default 7). Pass days=0 to clear. */
export function setMemoryTemporary(id: string, days = 7): MemoryPrefs {
  const prefs = pruneExpiredTemporary();
  const temporary = { ...prefs.temporary };
  if (days <= 0) {
    delete temporary[id];
  } else {
    const exp = new Date();
    exp.setDate(exp.getDate() + days);
    temporary[id] = exp.toISOString();
  }
  const next = { ...prefs, temporary };
  write(next);
  return next;
}

export function clearMemoryTemporary(id: string): MemoryPrefs {
  return setMemoryTemporary(id, 0);
}

/** Remove pin/temporary prefs for deleted memory ids (orphan cleanup). */
export function forgetMemoryPrefIds(ids: string[]): MemoryPrefs {
  const prefs = pruneExpiredTemporary();
  if (!ids?.length) return prefs;
  const drop = new Set(ids.filter(Boolean));
  const pinnedIds = prefs.pinnedIds.filter((id) => !drop.has(id));
  const temporary = { ...prefs.temporary };
  let changed = pinnedIds.length !== prefs.pinnedIds.length;
  for (const id of drop) {
    if (temporary[id]) {
      delete temporary[id];
      changed = true;
    }
  }
  if (!changed) return prefs;
  const next = { ...prefs, pinnedIds, temporary };
  write(next);
  return next;
}

/** Clear all local pin/temporary prefs (after clear-all). */
export function clearAllMemoryPrefs(): MemoryPrefs {
  write(EMPTY);
  return EMPTY;
}
