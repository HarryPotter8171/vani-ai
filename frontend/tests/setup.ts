import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Node 22+ ships its own experimental global `localStorage` / `sessionStorage`
// (gated behind --localstorage-file) which vitest's jsdom environment leaves
// in place instead of overriding with jsdom's real Storage — so the bare
// `localStorage` global (and `window.localStorage`, since vitest aliases
// `window` to the same global object) resolves to a stub that warns and
// returns `undefined`. Replace both with a small in-memory Storage
// implementation so app code (e.g. hooks/useTheme.ts) behaves like a real
// browser.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

beforeAll(() => {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(globalThis, name, {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  }
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

beforeAll(() => {
  // jsdom does not implement matchMedia — most components probe it for
  // dark-mode / pointer-type preferences.
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  }

  // jsdom does not implement ResizeObserver / IntersectionObserver.
  if (!("ResizeObserver" in window)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    // @ts-expect-error - test polyfill
    window.ResizeObserver = ResizeObserverStub;
  }

  if (!("IntersectionObserver" in window)) {
    class IntersectionObserverStub {
      root = null;
      rootMargin = "";
      thresholds: number[] = [];
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }
    // @ts-expect-error - test polyfill
    window.IntersectionObserver = IntersectionObserverStub;
  }

  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  }

  if (!("createObjectURL" in URL)) {
    // @ts-expect-error - test polyfill
    URL.createObjectURL = vi.fn(() => "blob:mock-url");
  }
  if (!("revokeObjectURL" in URL)) {
    // @ts-expect-error - test polyfill
    URL.revokeObjectURL = vi.fn();
  }

  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
});
